/**
 * Building a chain's job files (docs/design-process-chain.md, section 4f). One file per planned job:
 *   - a print job holds the fixtures, the pause to place the sheet and the features (stitch.ts), or just the features;
 *   - a laser job holds the operations picked on the drawing (loops nobody picked are not lasered).
 * Every body is sliced from the bed, so each group is moved to where its bodies sit on the bed and sliced as one part; the
 * features are raised by the sheet's thickness with the machine's Z offset after the pause. Each file goes through the same
 * file wrapper (rhinoFile) and the same file check (checkFile) as a Job setup file. The slicer is passed in so this is tested
 * without the engine (build.test.ts); `kiriSlicer` is the real one.
 *
 * Laser travel lifts (docs/proposal-chain-laser-lifts.md, approved by Mike): when anything printed stands above the sheet top, the
 * laser file lifts the head to the tallest + 2 mm for each travel that passes near it, and drops back to the focus height. Only the
 * two fixed lines (stitch.ts) and only with the chain header; operations over a printed body are refused. NOT TO BE USED ON A REAL
 * JOB UNTIL MACHINE CHECK CH14 PASSES (docs/testing.md): the Studio screen says so.
 */
import type { Check } from '@/slicer/check'
import { checkFile } from '@/slicer/check'
import { kiriJob } from '@/slicer/kiriSettings'
import { runKiri } from '@/slicer/engine'
import { combine, merge, partInfo, transform } from '@/slicer/model'
import { engineBody, rhinoFile } from '@/slicer/rhinoFile'
import type { MachineInfo, PartInfo, PrepareJob } from '@/slicer/types'
import { jobFileName, jobsOf, planSteps, type Chain } from './chain'
import type { Body, Placed } from './design'
import { assign, laserLoops } from '@/slicer/laserOps'
import { placeLoops } from './laser'
import { CLEARANCE, FEATURE_MAX, liftTravels, pathNearBox, stitchPrint } from './stitch'

/** What slices: the engine in the browser, or a stand-in in tests */
export interface Slicer {
  /** one part (already centred, bottom on Z 0) from the bed; the engine's own output */
  fdm(vertices: Float32Array, job: PrepareJob, part: PartInfo, machine: MachineInfo): Promise<string>
  /** a flat drawing's laser cut, and the part it makes */
  laser(file: File, job: PrepareJob, machine: MachineInfo): Promise<{ kiri: string; part: PartInfo }>
}

export const kiriSlicer: Slicer = {
  fdm: (v, job, part, machine) => runKiri(v, kiriJob(job, part, machine), () => {}),
  async laser(file, job, machine) {
    const { loadModelFile } = await import('@/slicer/engine')
    const parts = await loadModelFile(file)
    const shaped = transform(merge(parts.map((p) => p.vertices).filter((x) => x && x.length >= 9)), 0, 1)
    const part = partInfo(file.name, shaped, true)
    return { kiri: await runKiri(shaped, kiriJob(job, part, machine), () => {}), part }
  },
}

export interface BuiltFile {
  /** the file name and the tool it needs (the chain's own `jobs` entry) */
  file: string
  tool: string
  stages: number[]
  /** null when it could not be built: `problem` says why */
  text: string | null
  problem: string | null
  checks: Check[]
  /** travel lifts the file holds (0 for none); a file with lifts waits for CH14 on the machine */
  lifts?: number
}

export interface BuildInput {
  chain: Chain
  bodies: readonly Body[]
  placed: readonly Placed[]
  /** the print head's job (FDM, Kiri, its material) and the laser's (its material, placement on the sheet, the chain's operations) */
  printJob: PrepareJob | null
  laserJob: PrepareJob | null
  laserSrc: File | null
  machine: MachineInfo
  studioVersion: string
}

const isMove = (l: string) => /^G[01]\b/.test(l)

/** The bodies of one role as one part where they sit on the bed, or null when there are none */
export function groupOf(bodies: readonly Body[], placed: readonly Placed[], role: 'fixture' | 'feature') {
  const parts = bodies
    .filter((b) => b.role === role)
    .map((b) => {
      const p = placed.find((x) => x.id === b.id)
      return p ? { vertices: transform(b.vertices, 0, 1), x: (p.box[0] + p.box[2]) / 2, y: (p.box[1] + p.box[3]) / 2 } : null
    })
    .filter((x): x is { vertices: Float32Array; x: number; y: number } => !!x)
  if (!parts.length) return null
  const c = combine(parts)
  return { vertices: c.vertices, x: c.x, y: c.y, part: partInfo(`${role}s`, c.vertices, false) }
}

const fail = (file: string, tool: string, stages: number[], problem: string): BuiltFile => ({ file, tool, stages, text: null, problem, checks: [] })

async function sliceGroup(g: NonNullable<ReturnType<typeof groupOf>>, job: PrepareJob, machine: MachineInfo, slicer: Slicer): Promise<string[]> {
  const j: PrepareJob = { ...job, placement: { x: g.x, y: g.y, rotate: 0, scale: 1 } }
  return engineBody(await slicer.fdm(g.vertices, j, g.part, machine))
}

/** Build every job file of the chain, in run order. A job that can't be built comes back with the reason. */
export async function buildJobs(input: BuildInput, slicer: Slicer): Promise<BuiltFile[]> {
  const { chain, machine } = input
  const roles = new Map(chain.stages.map((s) => [s.id, s.role]))
  const out: BuiltFile[] = []
  let n = 0
  for (const job of jobsOf(planSteps(chain.stages))) {
    n++
    const file = jobFileName(chain.name, n, job.kind)
    const has = (r: string) => job.stages.some((id) => roles.get(id) === r)
    try {
      if (job.kind === 'print') {
        if (!input.printJob) {
          out.push(fail(file, job.tool, job.stages, 'The print head has no job settings (no material).'))
          continue
        }
        const fx = has('fixtures') ? groupOf(input.bodies, input.placed, 'fixture') : null
        const ft = has('features') ? groupOf(input.bodies, input.placed, 'feature') : null
        if ((has('fixtures') && !fx) || (has('features') && !ft)) {
          out.push(fail(file, job.tool, job.stages, `${has('fixtures') && !fx ? 'No body is marked as a fixture' : 'No body is marked as a feature'}.`))
          continue
        }
        const fxLines = fx ? await sliceGroup(fx, input.printJob, machine, slicer) : []
        const ftLines = ft ? await sliceGroup(ft, input.printJob, machine, slicer) : []
        let lines = ftLines.length ? ftLines : fxLines
        if (fx && ft) {
          const st = stitchPrint({ fixtures: fxLines, features: ftLines, thickness: chain.thickness })
          if ('error' in st) {
            out.push(fail(file, job.tool, job.stages, st.error))
            continue
          }
          lines = st.lines
        } else if (!lines.some(isMove)) {
          out.push(fail(file, job.tool, job.stages, 'The slicer made no moves.'))
          continue
        }
        const part = ft?.part ?? fx!.part
        const f = rhinoFile(lines.join('\n'), input.printJob, part, machine, input.studioVersion)
        const { checks } = checkFile(f.text, input.printJob, part, machine)
        out.push({ file, tool: job.tool, stages: job.stages, text: f.text, problem: checks.find((c) => c.level === 'error')?.label ?? null, checks })
      } else if (job.kind === 'laser') {
        if (!input.laserJob || !input.laserSrc || !chain.laser) {
          out.push(fail(file, job.tool, job.stages, 'The laser stage has no drawing yet.'))
          continue
        }
        // everything printed that stands above the sheet top (the laser's Z zero): the features, and any fixture taller than the sheet
        const t = chain.thickness ?? 0
        const obstacles = input.placed
          .filter((p) => p.role === 'feature' || p.role === 'fixture')
          .map((p) => ({ name: p.name, box: { x0: p.box[0], y0: p.box[1], x1: p.box[2], y1: p.box[3] }, above: p.role === 'feature' ? p.height : p.height - t }))
          .filter((o) => o.above > 0.001)
        const tallest = Math.max(0, ...obstacles.map((o) => o.above))
        if (tallest > FEATURE_MAX) {
          out.push(fail(file, job.tool, job.stages, `${Math.round(tallest * 100) / 100} mm of printed height is more than the ${FEATURE_MAX} mm a laser lift may clear.`))
          continue
        }
        const lj: PrepareJob = { ...input.laserJob, laser: { ...input.laserJob.laser, ops: chain.laser.ops, leaveRest: true } }
        const { kiri, part } = await slicer.laser(input.laserSrc, lj, machine)
        // operations over a printed body are refused: the focus is on the sheet top, not on the feature's top
        if (obstacles.length) {
          const loops = laserLoops(engineBody(kiri))
          const placed = placeLoops(loops, lj.placement)
          const { picked } = assign(chain.laser.ops, loops)
          // a cut or score line over a printed body is refused; an engrave fill is refused when its area overlaps one
          let over: string | null = null
          chain.laser.ops.forEach((op, k) => {
            for (const i of picked[k] ?? []) {
              const l = placed[i]!
              const o = obstacles.find((q) => (op.kind === 'fill' ? l.box.x0 < q.box.x1 && l.box.x1 > q.box.x0 && l.box.y0 < q.box.y1 && l.box.y1 > q.box.y0 : pathNearBox(l.pts, q.box, 0)))
              if (o && !over) over = o.name
            }
          })
          if (over) {
            out.push(fail(file, job.tool, job.stages, `A picked loop lies over ${over}. The laser is focused on the sheet top, not on a printed feature, so operations over one are not allowed. Move the drawing or pick other loops.`))
            continue
          }
        }
        const f = rhinoFile(kiri, lj, part, machine, input.studioVersion)
        let lines = f.text.split('\n')
        let lifts = 0
        if (obstacles.length) {
          const L = Number((tallest + CLEARANCE).toFixed(3))
          lines = liftTravels(lines, obstacles.map((o) => o.box), L)
          lifts = lines.filter((l) => /;RHINO_CHAIN lift$/.test(l)).length
          lines.splice(1, 0, `; rhino_chain_features = ${Number(tallest.toFixed(3))}`, `; rhino_chain_lift = ${L}`, '; Travel lifts: NOT FOR A REAL JOB until machine check CH14 has passed.')
        }
        const text = lines.join('\n')
        const { checks } = checkFile(text, lj, part, machine)
        const nothing = !lines.some((l) => /^M3\b/.test(l))
        out.push({ file, tool: job.tool, stages: job.stages, text: nothing ? null : text, lifts, problem: nothing ? 'No operation has a loop picked, so the laser file would do nothing.' : (checks.find((c) => c.level === 'error')?.label ?? null), checks })
      } else out.push(fail(file, job.tool, job.stages, `A ${job.kind} stage can't be built in a chain yet.`))
    } catch (e) {
      out.push(fail(file, job.tool, job.stages, e instanceof Error ? e.message : String(e)))
    }
  }
  return out
}
