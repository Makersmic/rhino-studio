/**
 * Laser operations (Job setup › Settings, after LaserWeb's CAM operations; Mike, Nov 11): different settings for
 * different loops of the same drawing. Kiri:Moto slices the drawing once with the job's own settings; this module
 * splits its cut into loops (each G0 … M3 S … G1 … M5 run), lets operations claim loops, and writes the cut again:
 * each operation in the user's order, its loops holes-first, with its own power, speed and passes, then everything
 * no operation picked, with the job's own settings. Plain functions, tested without a screen (laserOps.test.ts).
 *
 * Kinds: cut (through), score (mark the line, low power) and fill (engrave: hatch the inside of its loops, even-odd,
 * so picking a hole too leaves it unfilled). A loop picked by any operation isn't cut by "everything else"; picking a
 * loop for a fill and a cut engraves it, then cuts it out.
 *
 * Loops are remembered by their centre and size from the drawing's lower-left corner (LoopRef), so a pick survives
 * moving the part or a small kerf change, and is matched again after every slice.
 */
import type { LaserOp, LaserSettings, LoopRef } from './types'

export type P = [number, number]
export interface Loop {
  pts: P[]
  closed: boolean
  box: { x0: number; y0: number; x1: number; y1: number }
}

const TRAVEL = 6000
const num = (line: string, k: string) => {
  const m = new RegExp(`${k}(-?[\\d.]+)`, 'i').exec(line)
  return m ? Number(m[1]) : null
}
const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString()
/** min/max without spreading: a cut can have hundreds of thousands of points */
function boxOf(pts: P[]) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

/** The loops in Kiri's laser cut, in its order (holes before their outlines) */
export function laserLoops(cut: string[]): Loop[] {
  const out: Loop[] = []
  let at: P | null = null
  let run: P[] | null = null
  const end = () => {
    if (run && run.length > 1) {
      const [a, b] = [run[0]!, run[run.length - 1]!]
      out.push({ pts: run, closed: Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05, box: boxOf(run) })
    }
    run = null
  }
  for (const raw of cut) {
    const line = raw.replace(/;.*$/, '').trim()
    if (!line) continue
    const cmd = line.split(/\s+/)[0]!.toUpperCase()
    if (cmd === 'G0' || cmd === 'G1') {
      const x: number | undefined = num(line, 'X') ?? at?.[0]
      const y: number | undefined = num(line, 'Y') ?? at?.[1]
      if (x == null || y == null) continue
      at = [x, y]
      if (run && cmd === 'G1') run.push(at)
      else if (run && cmd === 'G0') { end(); }
    } else if (cmd === 'M3' || cmd === 'M4') {
      if ((num(line, 'S') ?? 1) > 0 && at) { end(); run = [at] }
    } else if (cmd === 'M5') end()
  }
  end()
  return out
}

export function drawingBox(loops: Loop[]) {
  return boxOf(loops.flatMap((l) => [[l.box.x0, l.box.y0], [l.box.x1, l.box.y1]] as P[]))
}

/** A loop as an operation remembers it: centre and size from the drawing's lower-left corner */
export function loopRef(l: Loop, origin: { x0: number; y0: number }): LoopRef {
  const r = (v: number) => Math.round(v * 100) / 100
  return { x: r((l.box.x0 + l.box.x1) / 2 - origin.x0), y: r((l.box.y0 + l.box.y1) / 2 - origin.y0), w: r(l.box.x1 - l.box.x0), h: r(l.box.y1 - l.box.y0) }
}

/** Which loop each remembered one is now (or -1): the nearest centre, within 1 mm plus a little for size */
export function matchLoops(refs: LoopRef[], loops: Loop[]): number[] {
  if (!loops.length) return refs.map(() => -1)
  const o = drawingBox(loops)
  const now = loops.map((l) => loopRef(l, o))
  return refs.map((r) => {
    let best = -1
    let bestD = Infinity
    now.forEach((n, i) => {
      const d = Math.hypot(n.x - r.x, n.y - r.y)
      const tol = 1 + 0.05 * Math.max(r.w, r.h)
      if (d <= tol && Math.abs(n.w - r.w) <= tol && Math.abs(n.h - r.h) <= tol && d < bestD) {
        best = i
        bestD = d
      }
    })
    return best
  })
}

/** Is p inside the closed loop? (even-odd ray cast) */
export function inside(p: P, l: Loop): boolean {
  if (!l.closed) return false
  let c = false
  const pts = l.pts
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!
    const [xj, yj] = pts[j]!
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
/** b lies inside a (its box inside a's and its first point inside a) */
export const within = (b: Loop, a: Loop) =>
  a !== b && a.closed && b.box.x0 >= a.box.x0 && b.box.y0 >= a.box.y0 && b.box.x1 <= a.box.x1 && b.box.y1 <= a.box.y1 && inside(b.pts[0]!, a)

/** Holes before the outlines around them: the most deeply nested first, else Kiri's order */
export function holesFirst(idx: number[], loops: Loop[]): number[] {
  const depth = (i: number) => loops.filter((a) => within(loops[i]!, a)).length
  return idx.map((i, k) => ({ i, k, d: depth(i) })).sort((a, b) => b.d - a.d || a.k - b.k).map((x) => x.i)
}

/**
 * Engrave fill: lines spacing mm apart at angle°, inside the loops by even-odd (a hole picked too stays empty).
 * Back and forth, so the head doesn't fly back for every line.
 */
export function hatch(loops: Loop[], spacing: number, angle: number): Array<[P, P]> {
  const polys = loops.filter((l) => l.closed)
  if (!polys.length || !(spacing > 0)) return []
  const a = (angle * Math.PI) / 180
  const [c, s] = [Math.cos(a), Math.sin(a)]
  const rot = (p: P): P => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c] // into the scan frame
  const back = (p: P): P => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]
  const edges: Array<[P, P]> = []
  for (const l of polys) for (let i = 0; i < l.pts.length - 1; i++) edges.push([rot(l.pts[i]!), rot(l.pts[i + 1]!)])
  const { y0, y1 } = boxOf(edges.flatMap((e) => [e[0], e[1]]))
  const out: Array<[P, P]> = []
  let flip = false
  for (let y = y0 + spacing / 2; y < y1; y += spacing) {
    const xs: number[] = []
    for (const [p, q] of edges) {
      if (p[1] > y !== q[1] > y) xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]))
    }
    xs.sort((m, n) => m - n)
    const row: Array<[P, P]> = []
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1]! - xs[i]! > 0.01) row.push([back([xs[i]!, y]), back([xs[i + 1]!, y])])
    if (flip) row.reverse().forEach((seg) => seg.reverse())
    out.push(...row)
    flip = !flip
  }
  return out
}

/** What each operation picked, matched to the loops now, and what's left for "everything else" */
export function assign(ops: LaserOp[], loops: Loop[]) {
  const picked = ops.map((o) => matchLoops(o.loops, loops))
  const used = new Set(picked.flat().filter((i) => i >= 0))
  const rest = loops.map((_, i) => i).filter((i) => !used.has(i))
  const missing = picked.map((p) => p.filter((i) => i < 0).length)
  return { picked: picked.map((p) => p.filter((i) => i >= 0)), rest, missing }
}

const KIND: Record<LaserOp['kind'], string> = { cut: 'Cut', score: 'Score', fill: 'Engrave fill' }
export const opTitle = (o: LaserOp, i: number) => o.name.trim() || `${KIND[o.kind]} ${i + 1}`

/**
 * Things to know about the order: a cut that frees a part before work inside it is done, and picks that no longer
 * match the drawing. Shown under the operations; none stops the file.
 */
export function opsWarnings(ops: LaserOp[], loops: Loop[]): string[] {
  const { picked, rest, missing } = assign(ops, loops)
  const out: string[] = []
  ops.forEach((o, i) => { if (missing[i]) out.push(`${opTitle(o, i)}: ${missing[i]} picked loop${missing[i] === 1 ? ' is' : 's are'} no longer in the drawing. Pick again.`) })
  // everything else runs last, as a cut
  const steps = [...ops.map((o, i) => ({ title: opTitle(o, i), kind: o.kind, idx: picked[i]! })), { title: 'Everything else', kind: 'cut' as const, idx: rest }]
  steps.forEach((a, i) => {
    if (a.kind !== 'cut') return
    for (const b of steps.slice(i + 1)) {
      if (b.idx.some((bi) => a.idx.some((ai) => within(loops[bi]!, loops[ai]!)))) {
        out.push(`${a.title} cuts around ${b.title.toLowerCase() === 'everything else' ? 'loops of Everything else' : b.title}, which runs after it: the part may drop or shift first. Move ${a.title} down.`)
        break
      }
    }
  })
  return out
}

const pathLines = (l: Loop, s: string, feed: number): string[] => [
  `G0 X${fmt(l.pts[0]![0])} Y${fmt(l.pts[0]![1])} F${TRAVEL}`,
  `M3 S${s}`,
  ...l.pts.slice(1).map((p, i) => `G1 X${fmt(p[0])} Y${fmt(p[1])}${i === 0 ? ` F${fmt(feed)}` : ''}`),
  'M5',
]

/**
 * The cut again, by operation. Without operations (or with none picking anything) the cut is left as Kiri wrote it,
 * repeated for the job's passes, exactly as before.
 */
export function assembleLaser(cut: string[], l: LaserSettings, sMax: number): string[] {
  const passes = Math.max(1, Math.round(l.passes))
  const ops = l.ops ?? []
  const plain = () => {
    const out: string[] = []
    for (let p = 1; p <= passes; p++) {
      if (passes > 1) out.push(`; pass ${p} of ${passes}`)
      for (const line of cut) out.push(line)
    }
    return out
  }
  if (!ops.some((o) => o.loops.length)) return plain()
  const loops = laserLoops(cut)
  const { picked, rest } = assign(ops, loops)
  if (!picked.some((p) => p.length)) return plain()
  const out: string[] = []
  const S = (power: number) => fmt(Math.max(0, Math.min(1, power)) * sMax)
  const run = (title: string, kind: LaserOp['kind'], idx: number[], power: number, feed: number, n: number, spacing = 0.2, angle = 0) => {
    if (!idx.length) return
    const reps = Math.max(1, Math.round(n))
    out.push(`; operation: ${title} (${KIND[kind].toLowerCase()}, ${Math.round(power * 100)} %, ${fmt(feed)} mm/min${reps > 1 ? `, ${reps} passes` : ''})`)
    const body: string[] = []
    if (kind === 'fill') {
      for (const [a, b] of hatch(idx.map((i) => loops[i]!), spacing, angle)) body.push(...pathLines({ pts: [a, b], closed: false, box: { x0: 0, y0: 0, x1: 0, y1: 0 } }, S(power), feed))
    } else for (const i of holesFirst(idx, loops)) body.push(...pathLines(loops[i]!, S(power), feed))
    for (let p = 1; p <= reps; p++) {
      if (reps > 1) out.push(`; pass ${p} of ${reps}`)
      for (const line of body) out.push(line)
    }
  }
  ops.forEach((o, i) => run(opTitle(o, i), o.kind, picked[i]!, o.power, o.feed, o.passes, o.spacing, o.angle))
  run('Everything else', 'cut', rest, l.power, l.feed, passes)
  return out
}

/** A new operation, from the job's cut settings (cut), low power (score) or the tuned engrave values (fill) */
export function newOp(kind: LaserOp['kind'], l: LaserSettings, engrave?: { power?: number; feed?: number }): LaserOp {
  const id = Math.random().toString(36).slice(2, 8)
  if (kind === 'fill') return { id, kind, name: '', power: engrave?.power ?? 0.3, feed: engrave?.feed ?? 2000, passes: 1, spacing: 0.2, angle: 0, loops: [] }
  if (kind === 'score') return { id, kind, name: '', power: Math.min(l.power, 0.15), feed: Math.max(l.feed, 1500), passes: 1, spacing: 0.2, angle: 0, loops: [] }
  return { id, kind, name: '', power: l.power, feed: l.feed, passes: l.passes, spacing: 0.2, angle: 0, loops: [] }
}

/**
 * Click a loop while picking for op k: toggle it. A loop is in at most one line operation (cut or score) and at most
 * one fill, so picking it for a cut takes it off another cut or score.
 */
export function toggleLoop(ops: LaserOp[], k: number, loop: Loop, loops: Loop[]): void {
  const o = ops[k]
  if (!o) return
  const ref = loopRef(loop, drawingBox(loops))
  const i = loops.indexOf(loop)
  const at = matchLoops(o.loops, loops).indexOf(i)
  if (at >= 0) {
    o.loops.splice(at, 1)
    return
  }
  const line = o.kind !== 'fill'
  ops.forEach((other, j) => {
    if (j === k || (other.kind !== 'fill') !== line) return
    const m = matchLoops(other.loops, loops)
    other.loops = other.loops.filter((_, n) => m[n] !== i)
  })
  o.loops.push(ref)
}
