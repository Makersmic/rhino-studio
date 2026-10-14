/**
 * Checks a finished Rhino job file before it can be sent. Any check that fails
 * at level 'error' blocks Send (and Download): Studio never puts a file it
 * thinks is unsafe on the Pi.
 *
 * It reads the G-code itself, line by line, the way Klipper will, so it checks
 * what will actually run, not what the settings said:
 *   - the header names the toolhead, and START_JOB (print heads) names the same one
 *   - nothing that homes, restarts, swaps tools, changes offsets or starts other files
 *   - every move inside the travel limits (machine coordinates) or the stock
 *     (CNC work coordinates), with the frame each process uses
 *   - heaters only switched off in the file (START_JOB heats from the material table)
 *   - laser power never above laser_s_max, and the laser switched off at the end
 *   - laser files have no Z moves; knife depth stays shallow
 *   - the file ends with END_PRINT
 * It is a second line of defence: the macros on the machine keep their own checks.
 */
import type { MachineInfo, PartInfo, PrepareJob } from './types'
import { cncStock } from './kiriSettings'

export interface Check {
  id: string
  level: 'error' | 'warn' | 'ok'
  label: string
  detail?: string
}

export interface FileStats {
  moves: number
  /** mm travelled while cutting / extruding */
  workLength: number
  /** rough time, from feeds only (no acceleration) */
  seconds: number
  layers: number
  /** mm of filament (FDM) */
  filament: number
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/^G28\b/, 'homes the machine'],
  [/^(SET_KINEMATIC_POSITION|FORCE_MOVE)\b/, 'redefines where the machine is'],
  [/^(FIRMWARE_RESTART|RESTART|SAVE_CONFIG|M112)\b/, 'restarts or stops Klipper'],
  [/^(SWAP_TOOL|CONFIRM_TOOL_INSTALL|RESTORE_TOOL|ABORT_TOOL_SWAP|T\d+|M6)\b/, 'changes the tool'],
  [/^(SET_GCODE_OFFSET|G10|G5[3-9]|SET_Z_ZERO)\b/, 'changes the work zero'],
  [/^(SDCARD_PRINT_FILE|LASER_JOB_SETUP|CNC_JOB_SETUP|DRAGKNIFE_JOB_SETUP|TOOL_JOB_SETUP|_START_JOB_FILE)\b/, 'starts another job'],
  [/^(ACTIVATE_LASER|SET_LASER_POWER|SET_PIN|SET_TOOL_POWER|Spindle_ACTIVATE)\b/i, 'switches a tool on directly'],
]

interface Pos {
  x: number | null
  y: number | null
  z: number | null
}

const word = (l: string, w: string) => {
  const m = new RegExp(`\\b${w}(-?\\d*\\.?\\d+)`).exec(l)
  return m ? +m[1]! : null
}

export function checkFile(text: string, job: PrepareJob, part: PartInfo, m: MachineInfo): { checks: Check[]; stats: FileStats } {
  const checks: Check[] = []
  const add = (id: string, ok: boolean, label: string, detail?: string, warnOnly = false) =>
    checks.push({ id, level: ok ? 'ok' : warnOnly ? 'warn' : 'error', label, detail: ok ? undefined : detail })

  const raw = text.split(/\r?\n/)
  const head = /^;\s*rhino_toolhead\s*=\s*(\S+)/m.exec(text)
  add('header', head?.[1] === job.toolhead, `Says it's for ${job.toolhead}`, `The file's rhino_toolhead line says ${head?.[1] ?? 'nothing'}.`)

  // ---- walk the file the way Klipper reads it
  const pos: Pos = { x: null, y: null, z: null }
  let absolute = true
  let feed = 0
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let started = job.process !== 'fdm' // print moves count from after START_JOB
  const forbidden: string[] = []
  const heat: string[] = []
  const stats: FileStats = { moves: 0, workLength: 0, seconds: 0, layers: 0, filament: 0 }
  let laserMaxS = 0
  let laserOn = false
  let laserOnAtEnd = false
  let zMoves = 0
  let relMoves = 0
  let startJob: string | null = null
  let lastCommand = ''

  for (const rl of raw) {
    const l = rl.replace(/;.*$/, '').trim()
    if (!l) {
      if (/^;\s*LAYER_CHANGE/.test(rl)) stats.layers++
      continue
    }
    const cmd = l.split(/\s+/)[0]!.toUpperCase()
    lastCommand = cmd
    for (const [re, why] of FORBIDDEN) if (re.test(l.toUpperCase())) forbidden.push(`${cmd} (${why})`)

    if (cmd === 'START_JOB') {
      startJob = l
      started = true
      continue
    }
    if (cmd === 'G90') absolute = true
    else if (cmd === 'G91') absolute = false
    else if (cmd === 'G92') {
      if (/\b[XYZ]-?\d/.test(l)) forbidden.push('G92 X/Y/Z (redefines the position)')
    } else if (/^M(104|109|140|190)$/.test(cmd) || cmd === 'SET_HEATER_TEMPERATURE') {
      const s = word(l, 'S') ?? word(l, 'TARGET=') ?? 0
      if (s > 0) heat.push(l)
    } else if (cmd === 'M3' || cmd === 'M4') {
      const s = word(l, 'S')
      if (job.process !== 'laser') forbidden.push(`${cmd} (switches a tool on; the setup wizard does that)`)
      else {
        laserMaxS = Math.max(laserMaxS, s ?? m.laserSMax)
        laserOn = true
      }
    } else if (cmd === 'M5') laserOn = false
    else if (/^G[0-3]$/.test(cmd)) {
      if (!absolute) {
        relMoves++
        continue
      }
      const f = word(l, 'F')
      if (f) feed = f
      const next: Pos = { x: word(l, 'X') ?? pos.x, y: word(l, 'Y') ?? pos.y, z: word(l, 'Z') ?? pos.z }
      if (word(l, 'Z') !== null) zMoves++
      if (started) {
        ;(['x', 'y', 'z'] as const).forEach((a, i) => {
          const v = next[a]
          if (v !== null && word(l, a.toUpperCase()) !== null) {
            min[i] = Math.min(min[i]!, v)
            max[i] = Math.max(max[i]!, v)
          }
        })
      }
      const dist = pos.x !== null && next.x !== null && pos.y !== null && next.y !== null ? Math.hypot(next.x - pos.x, next.y - pos.y, (next.z ?? 0) - (pos.z ?? 0)) : 0
      const e = word(l, 'E')
      const working = cmd !== 'G0' && (job.process === 'fdm' ? (e ?? 0) > 0 : job.process === 'laser' ? laserOn : true)
      if (e && e > 0) stats.filament += e
      if (dist > 0) {
        stats.moves++
        if (working) stats.workLength += dist
        const speed = cmd === 'G0' ? Math.max(feed, 3000) : feed || 1000
        stats.seconds += (dist / speed) * 60
      }
      pos.x = next.x
      pos.y = next.y
      pos.z = next.z
    }
  }
  laserOnAtEnd = laserOn

  add('commands', forbidden.length === 0, 'Nothing that homes, swaps tools, restarts or changes the work zero', [...new Set(forbidden)].slice(0, 4).join('; '))
  add('relative', relMoves === 0, 'Absolute moves only', `${relMoves} relative moves; Studio can't check where they go.`)
  add('end', lastCommand === 'END_PRINT', 'Ends with END_PRINT (tool off, offsets cleared, bed parked)', `The last command is ${lastCommand || 'missing'}.`)

  const has = Number.isFinite(min[0]!) && Number.isFinite(min[1]!)
  const box = has ? `X ${fmt(min[0]!)} to ${fmt(max[0]!)}, Y ${fmt(min[1]!)} to ${fmt(max[1]!)}` : ''
  add('moves', has, 'Has moves to make', 'The file has no moves - is the part on the bed and taller than the cut height?')

  if (job.process === 'fdm') {
    add('start', !!startJob && new RegExp(`TOOLHEAD="?${job.toolhead}"?\\b`).test(startJob), `START_JOB checks for ${job.toolhead} on the machine`, startJob ? `START_JOB asks for a different tool: ${startJob}` : 'No START_JOB line.')
    add('heat', heat.length === 0, 'Temperatures come from the material table (START_JOB)', `The file heats on its own: ${heat.slice(0, 2).join(', ')}`)
  } else {
    add('heat', heat.length === 0, 'No heaters in the file', `The file heats: ${heat.slice(0, 2).join(', ')}`)
  }

  if (has && job.process !== 'cnc') {
    const okX = min[0]! >= Math.max(0, m.travelMin[0]) - 1e-6 && max[0]! <= Math.min(m.workArea.x, m.travelMax[0]) + 1e-6
    const okY = min[1]! >= Math.max(0, m.travelMin[1]) - 1e-6 && max[1]! <= Math.min(m.workArea.y, m.travelMax[1]) + 1e-6
    add('bed', okX && okY, `Inside the bed (${fmt(m.workArea.x)} x ${fmt(m.workArea.y)} mm)`, `Goes to ${box}. Move the part.`)
  }

  if (job.process === 'fdm' && has) {
    add('height', max[2]! <= m.travelMax[2] - 5 + 1e-6 && min[2]! > 0, `Fits under the Z limit (${fmt(m.travelMax[2])} mm)`, `Z goes from ${fmt(min[2]!)} to ${fmt(max[2]!)}.`)
    if (m.prime) {
      const p = m.prime
      const clear = min[0]! > p.x + 3 || max[1]! < p.y - 3 || min[1]! > p.y + p.length + 3
      add('prime', clear, 'Clear of the prime line', `The prime line runs at X${fmt(p.x)} from Y${fmt(p.y)} to Y${fmt(p.y + p.length)}; the part starts at X${fmt(min[0]!)}. Move it right.`, true)
    }
  }

  if (job.process === 'laser') {
    add('laserpower', laserMaxS > 0 && laserMaxS <= m.laserSMax + 1e-6, `Laser power at most ${Math.round((laserMaxS / m.laserSMax) * 100)}% (S${fmt(laserMaxS)} of ${fmt(m.laserSMax)})`, laserMaxS === 0 ? 'The laser never switches on.' : `S${fmt(laserMaxS)} is above laser_s_max ${fmt(m.laserSMax)}.`)
    add('laseroff', !laserOnAtEnd, 'Laser off at the end', 'The file ends with the laser on.')
    add('laserz', zMoves === 0, 'No Z moves (cuts at the focus height)', `${zMoves} Z moves in the file.`)
  }

  if (job.process === 'dragknife' && has) {
    const deepest = job.knife.depth * Math.max(1, job.knife.passes)
    add('knifez', min[2]! >= -Math.min(3, deepest) - 1e-6 && max[2]! <= 10, `Blade goes at most ${fmt(-min[2]!)} mm deep`, `Z goes from ${fmt(min[2]!)} to ${fmt(max[2]!)}; a drag knife should stay within 3 mm.`)
  }

  if (job.process === 'cnc' && has) {
    const st = cncStock(job, part)
    const r = job.cnc.toolDiameter / 2 + 0.05
    const inStock = min[0]! >= -r && min[1]! >= -r && max[0]! <= st.x + r && max[1]! <= st.y + r
    add('stock', inStock, `Stays over the stock (${fmt(st.x)} x ${fmt(st.y)} mm)`, `Goes to ${box}.`)
    add('depth', min[2]! >= -st.z - 0.05, `Cuts at most ${fmt(-min[2]!)} mm deep (stock ${fmt(st.z)} mm)`, `Goes to Z ${fmt(min[2]!)}, below the stock.`)
    add('clear', max[2]! <= job.cnc.clearance + 1 && max[2]! > 0, `Lifts ${fmt(max[2]!)} mm above the stock between cuts`, `Highest Z is ${fmt(max[2]!)}.`)
    add('fits', st.x <= m.workArea.x && st.y <= m.workArea.y, 'Stock fits the machine', `${fmt(st.x)} x ${fmt(st.y)} mm is bigger than ${fmt(m.workArea.x)} x ${fmt(m.workArea.y)}.`)
    const through = min[2]! <= -st.z + 0.05
    if (through) checks.push({ id: 'through', level: 'warn', label: 'Cuts right through the stock', detail: 'Use a spoil board and hold the part down (no tabs yet): the last pass frees it.' })
  }

  return { checks, stats }
}

function fmt(v: number) {
  return (Math.round(v * 100) / 100).toString()
}

export const blocking = (checks: Check[]) => checks.filter((c) => c.level === 'error')
