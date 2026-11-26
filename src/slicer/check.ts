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
 *
 * Uploaded files (sliced elsewhere, e.g. Orca, LightBurn, Fusion) are read with
 * the same rules, except where another program's normal habits are safe on the
 * Rhino: a START_JOB line counts as the toolhead header, temperatures within the
 * heater limits are a note (Orca sets the bed from layer 2), a missing END_PRINT
 * or a spindle M3 in a CNC file is a note, and Studio can't know a CNC file's
 * stock, so only its size and depth are checked.
 */
import { CHANGES_LOTS, CHANGES_MANY } from '@/prepare/lanesJob'
import { HEAT_LIMITS } from '@/control/heatLimits'
import type { MachineInfo, PartInfo, PrepareJob } from './types'
import { cncStock } from './kiriSettings'
import { chainRaise } from '@/chain/stitch'

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
  // G54 alone only re-applies the work zero CNC_JOB_SETUP saved; the others would pick a different one
  [/^(SET_GCODE_OFFSET|G10|G5[5-9]|SET_Z_ZERO)\b/, 'changes the work zero'],
  [/^(SDCARD_PRINT_FILE|LASER_JOB_SETUP|CNC_JOB_SETUP|DRAGKNIFE_JOB_SETUP|TOOL_JOB_SETUP|_START_JOB_FILE)\b/, 'starts another job'],
  [/^(ACTIVATE_LASER|SET_LASER_POWER|SET_PIN|SET_TOOL_POWER|Spindle_ACTIVATE)\b/i, 'switches a tool on directly'],
  // A file may not write a prompt: its buttons would run with the wizards' trust (audit S2)
  [/^RESPOND\b.*ACTION:PROMPT/, 'writes a prompt button; only a macro may'],
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

/** Klipper's heater limits in Studio (the same record the Control screen uses: src/control/heatLimits.ts) */
export const HEAT_MAX = HEAT_LIMITS

export function checkFile(text: string, job: PrepareJob, part: PartInfo | null, m: MachineInfo, opts: { upload?: boolean; laneMacro?: boolean } = {}): { checks: Check[]; stats: FileStats } {
  const upload = !!opts.upload
  const checks: Check[] = []
  const add = (id: string, ok: boolean, label: string, detail?: string, warnOnly = false) =>
    checks.push({ id, level: ok ? 'ok' : warnOnly ? 'warn' : 'error', label, detail: ok ? undefined : detail })

  const raw = text.split(/\r?\n/)
  // lane changes (two filaments in one job): the machine needs the macro, or Klipper reports an unknown command and carries on
  const laneChanges = raw.filter((l) => /^SWITCH_LANE\b/.test(l)).length
  if (laneChanges) {
    const lanes = [...new Set(raw.map((l) => /^SWITCH_LANE LANE=(\d+)/.exec(l)?.[1]).filter((v): v is string => !!v))].map((v) => Number(v) + 1).sort()
    if (laneChanges > CHANGES_LOTS) checks.push({ id: 'lane-budget', level: 'warn', label: `${laneChanges} lane changes`, detail: 'That is a lot of purging, time and wear on the lane mechanism. Supports on the part’s own lane (interface layers only on the other), or separate jobs, bring it down.' })
    else if (laneChanges > CHANGES_MANY) checks.push({ id: 'lane-budget', level: 'warn', label: `${laneChanges} lane changes`, detail: 'Each one is a purge and some time. Fewer parts sharing layers, or only the interface layers on the other lane, bring it down.' })
    add('lanes', !!opts.laneMacro, `Selects a filament lane ${laneChanges} time${laneChanges === 1 ? '' : 's'} (lanes ${lanes.join(' and ')})`,
      'This machine has no SWITCH_LANE macro yet, so Klipper would skip each lane change with an "unknown command" and carry on, printing with the wrong filament. Slicing and previewing work; sending waits for the machine’s lane-change macros.')
  }
  const head = /^;\s*rhino_toolhead\s*=\s*(\S+)/m.exec(text)
  const sj = /^\s*START_JOB\b[^\n;]*?\bTOOLHEAD=("?)([A-Za-z0-9_-]+)\1/im.exec(text)
  const declared = head?.[1] ?? (upload ? sj?.[2] : undefined) ?? null
  if (upload && !declared) add('header', false, `Says it's for ${job.toolhead}`, `The file doesn't say which toolhead it's for. Only send it if it was made for this one; Studio adds "; rhino_toolhead = ${job.toolhead}" to the copy it sends.`, true)
  else add('header', declared === job.toolhead, `Says it's for ${job.toolhead}`, `The file says it's for ${declared ?? 'nothing'}.`)

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
  /** the chain's raise for everything printed after the pause (0 when there is none) */
  let zAdjust = 0
  let startJob: string | null = null
  let lastCommand = ''
  let endPrint = false
  // where the printing itself went (extruding moves only), to check the file is the part on screen
  const work = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z1: -Infinity }
  let spindleOn = 0
  const heatHigh: string[] = []
  const hitKeepOut = new Set<string>()
  const inZone = (x: number, y: number) => m.keepOut.find((k) => x >= k.x0 && x <= k.x1 && y >= k.y0 && y <= k.y1)

  for (const rl of raw) {
    const l = rl.replace(/;.*$/, '').trim()
    if (!l) {
      if (/^;\s*LAYER_CHANGE/.test(rl)) stats.layers++
      continue
    }
    const cmd = l.split(/\s+/)[0]!.toUpperCase()
    const prevCommand = lastCommand
    lastCommand = cmd
    // a process chain's one Z raise, straight after the pause that placed the sheet (chain/stitch.ts); any other offset stays forbidden
    const raise = chainRaise(l, prevCommand, zAdjust)
    if (raise !== null) {
      zAdjust = raise
      continue
    }
    for (const [re, why] of FORBIDDEN) if (re.test(l.toUpperCase())) forbidden.push(`${cmd} (${why})`)

    if (cmd === 'END_PRINT') endPrint = true
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
      const bed = /^M1[49]0$/.test(cmd) || /HEATER=heater_bed/i.test(l)
      if (s > (bed ? HEAT_MAX.bed : HEAT_MAX.hotend)) heatHigh.push(l)
    } else if (cmd === 'M3' || cmd === 'M4') {
      const s = word(l, 'S')
      if (upload && job.process === 'cnc') spindleOn++
      else if (job.process !== 'laser') forbidden.push(`${cmd} (switches a tool on; the setup wizard does that)`)
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
            const at = a === 'z' ? v + zAdjust : v
            min[i] = Math.min(min[i]!, at)
            max[i] = Math.max(max[i]!, at)
          }
        })
      }
      const dist = pos.x !== null && next.x !== null && pos.y !== null && next.y !== null ? Math.hypot(next.x - pos.x, next.y - pos.y, (next.z ?? 0) - (pos.z ?? 0)) : 0
      const e = word(l, 'E')
      const working = cmd !== 'G0' && (job.process === 'fdm' ? (e ?? 0) > 0 : job.process === 'laser' ? laserOn : true)
      if (e && e > 0) stats.filament += e
      if (working && started && job.process === 'fdm' && next.x !== null && next.y !== null) {
        work.x0 = Math.min(work.x0, next.x)
        work.x1 = Math.max(work.x1, next.x)
        work.y0 = Math.min(work.y0, next.y)
        work.y1 = Math.max(work.y1, next.y)
        if (next.z !== null) work.z1 = Math.max(work.z1, next.z + zAdjust)
      }
      // Printing or cutting over a keep-out area (checked every 1 mm along the move)
      if (working && started && job.process !== 'cnc' && m.keepOut.length && pos.x !== null && pos.y !== null && next.x !== null && next.y !== null) {
        const steps = Math.max(1, Math.ceil(Math.hypot(next.x - pos.x, next.y - pos.y)))
        for (let i = 0; i <= steps; i++) {
          const k = inZone(pos.x + ((next.x - pos.x) * i) / steps, pos.y + ((next.y - pos.y) * i) / steps)
          if (k) {
            hitKeepOut.add(k.label)
            break
          }
        }
      }
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
  add('relative', relMoves === 0, 'Absolute moves only', `${relMoves} relative moves; Studio can't check where they go.`, upload)
  if (upload) add('end', endPrint, 'Ends with END_PRINT (tool off, offsets cleared, bed parked)', `No END_PRINT: at the end the tool${job.process === 'laser' ? "'s power rail" : ''} isn't switched off by the file and the bed isn't parked. Add END_PRINT to the program's end code.`, true)
  else add('end', lastCommand === 'END_PRINT', 'Ends with END_PRINT (tool off, offsets cleared, bed parked)', `The last command is ${lastCommand || 'missing'}.`)
  if (spindleOn) checks.push({ id: 'spindle', level: 'warn', label: 'Spindle commands in the file', detail: `${spindleOn} M3/M4 lines. CNC_JOB_SETUP starts the spindle before the file runs, and M3 does nothing while it runs. Speeds in the file are ignored: the wizard sets the throttle.` })

  const has = Number.isFinite(min[0]!) && Number.isFinite(min[1]!)
  const box = has ? `X ${fmt(min[0]!)} to ${fmt(max[0]!)}, Y ${fmt(min[1]!)} to ${fmt(max[1]!)}` : ''
  add('moves', has, 'Has moves to make', 'The file has no moves - is the part on the bed and taller than the cut height?')

  if (heatHigh.length) add('heatmax', false, 'Temperatures within the heater limits', `Temperature above the limits (${HEAT_MAX.hotend}° nozzle, ${HEAT_MAX.bed}° bed): ${heatHigh.slice(0, 2).join(', ')}`)
  if (job.process === 'fdm') {
    add('start', !!startJob && new RegExp(`TOOLHEAD="?${job.toolhead}"?\\b`).test(startJob), `START_JOB checks for ${job.toolhead} on the machine`, startJob ? `START_JOB asks for a different tool: ${startJob}` : 'No START_JOB line, so nothing checks the mounted tool, homes or heats. Use the Rhino start code (START_JOB ...) in the slicer.')
    if (upload) add('heat', heat.length === 0, 'Temperatures come from the material table (START_JOB)', `The file also sets temperatures itself (fine within the limits, e.g. Orca's bed temperature from layer 2): ${heat.slice(0, 2).join(', ')}`, true)
    else add('heat', heat.length === 0, 'Temperatures come from the material table (START_JOB)', `The file heats on its own: ${heat.slice(0, 2).join(', ')}`)
  } else {
    add('heat', heat.length === 0, 'No heaters in the file', `The file heats: ${heat.slice(0, 2).join(', ')}`)
  }

  // Is this file the part on screen? Printing reaches the part's top and covers its footprint (supports, brim and a raft
  // only add to it). A file from a different model, or an old one, usually fails this. A note, never a block.
  if (!upload && job.process === 'fdm' && part && Number.isFinite(work.z1) && stats.filament > 0) {
    const sx = part.size.x
    const sy = part.size.y
    const px = job.placement.x
    const py = job.placement.y
    const tol = 3
    const covers = work.x0 <= px - sx / 2 + tol && work.x1 >= px + sx / 2 - tol && work.y0 <= py - sy / 2 + tol && work.y1 >= py + sy / 2 - tol
    const topOk = work.z1 >= part.size.z - 1 && work.z1 <= part.size.z + 8
    add(
      'matches',
      covers && topOk,
      'The file is the part on screen',
      `The part is ${fmt(sx)} x ${fmt(sy)} x ${fmt(part.size.z)} mm, but the file prints X ${fmt(work.x0)} to ${fmt(work.x1)}, Y ${fmt(work.y0)} to ${fmt(work.y1)}, up to Z ${fmt(work.z1)}. It may be a different model's slice: Prepare again, and tell the maintainer if it keeps happening.`,
      true,
    )
  }

  if (has && job.process !== 'cnc') {
    const okX = min[0]! >= Math.max(0, m.travelMin[0]) - 1e-6 && max[0]! <= Math.min(m.workArea.x, m.travelMax[0]) + 1e-6
    const okY = min[1]! >= Math.max(0, m.travelMin[1]) - 1e-6 && max[1]! <= Math.min(m.workArea.y, m.travelMax[1]) + 1e-6
    add('keepout', hitKeepOut.size === 0, 'Clear of the leadscrew and other keep-out areas', `Prints or cuts over: ${[...hitKeepOut].join(', ')}. Move the part.`)
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
    const deepest = upload ? 3 : job.knife.depth * Math.max(1, job.knife.passes)
    add('knifez', min[2]! >= -Math.min(3, deepest) - 1e-6 && max[2]! <= 10, `Blade goes at most ${fmt(-min[2]!)} mm deep`, `Z goes from ${fmt(min[2]!)} to ${fmt(max[2]!)}; a drag knife should stay within 3 mm.`)
  }

  if (job.process === 'cnc' && has && (upload || !part)) {
    // A file made elsewhere: Studio doesn't know the stock or the work zero, only the file itself
    const w = max[0]! - min[0]!
    const d = max[1]! - min[1]!
    add('fits', w <= m.workArea.x && d <= m.workArea.y, `Fits the machine (${fmt(w)} x ${fmt(d)} mm of moves)`, `The moves cover ${fmt(w)} x ${fmt(d)} mm, more than ${fmt(m.workArea.x)} x ${fmt(m.workArea.y)}.`)
    add('clear', max[2]! > 0, `Lifts ${fmt(max[2]!)} mm above Z0 between cuts`, 'The file never goes above Z0: check its work zero is the top of the stock.', true)
    checks.push({ id: 'depth', level: min[2]! < -50 ? 'error' : 'warn', label: `Cuts down to Z ${fmt(min[2]!)}`, detail: `Check that's the stock's thickness or less, with Z0 on its top (CNC_JOB_SETUP). X ${fmt(min[0]!)} to ${fmt(max[0]!)}, Y ${fmt(min[1]!)} to ${fmt(max[1]!)} from the work zero.` })
  } else if (job.process === 'cnc' && has && part) {
    const st = cncStock(job, part)
    const r = job.cnc.toolDiameter / 2 + 0.05
    const inStock = min[0]! >= -r && min[1]! >= -r && max[0]! <= st.x + r && max[1]! <= st.y + r
    add('stock', inStock, `Stays over the stock (${fmt(st.x)} x ${fmt(st.y)} mm)`, `Goes to ${box}.`)
    add('depth', min[2]! >= -st.z - 0.05, `Cuts at most ${fmt(-min[2]!)} mm deep (stock ${fmt(st.z)} mm)`, `Goes to Z ${fmt(min[2]!)}, below the stock.`)
    add('flute', -min[2]! <= job.cnc.fluteLength + 0.05, `Within the tool's ${fmt(job.cnc.fluteLength)} mm cutting length`, `Cuts ${fmt(-min[2]!)} mm deep, deeper than the flutes (${fmt(job.cnc.fluteLength)} mm): the shank would rub. Use a longer tool or a thinner part.`)
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
