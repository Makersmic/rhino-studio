/**
 * Reads G-code into compact arrays for the 3D viewer: what the machine would do,
 * not what the file seems to mean. Plain TypeScript with no DOM or three.js, so it
 * runs in a worker and in tests. It works on bytes in chunks, so a big file never
 * has to exist as one string.
 *
 * It follows Klipper where slicers and Klipper differ:
 *   - G0 and G1 are the same move, and either can extrude
 *   - E is relative after G91 or M83, like gcode_move.py
 *   - S on a G1 is ignored, so tool power comes only from M3/M4/M5
 *   - a bare "X10 Y10" line is not a move, so it's counted and skipped
 * Macros can't be run here: they're counted and skipped, never guessed at.
 */

export const MOVE_RAPID = 0
export const MOVE_FEED = 1
export const MOVE_EXTRUDE = 2

/** What a printed move is, from the slicer's ;TYPE: (PrusaSlicer, Orca, Cura) or "; feature" (Kiri:Moto) comments */
export const FEATURE_UNKNOWN = 0
export const FEATURE_OUTER_WALL = 1
export const FEATURE_INNER_WALL = 2
export const FEATURE_FILL = 3
export const FEATURE_SUPPORT = 4
export const FEATURE_OTHER = 5

/** A slicer's name for a feature, as one of the FEATURE_ codes */
export function featureOf(name: string): number {
  const n = name.trim().toLowerCase()
  if (!n) return FEATURE_UNKNOWN
  if (/support/.test(n)) return FEATURE_SUPPORT
  if (/external perimeter|outer wall|wall-outer|overhang perimeter|overhang wall/.test(n)) return FEATURE_OUTER_WALL
  if (/perimeter|inner wall|wall-inner|^wall|shells?$/.test(n)) return FEATURE_INNER_WALL
  if (/fill|skin|top|bottom|bridge|ironing|sparse|solid/.test(n)) return FEATURE_FILL
  return FEATURE_OTHER
}

/** How the layers were found: slicer comments, rises in printed height, cutting depths, or not at all */
export type LayerSource = 'markers' | 'extrusion' | 'depth' | 'none'

export interface GcodeBounds {
  min: [number, number, number]
  max: [number, number, number]
}

export interface ParsedGcode {
  moveCount: number
  /** Six floats per move (x0 y0 z0 x1 y1 z1), ready to draw as line segments */
  segments: Float32Array
  /** MOVE_RAPID, MOVE_FEED or MOVE_EXTRUDE per move */
  kinds: Uint8Array
  /** Byte offset of each move's line in the file, to match Klipper's file_position */
  offsets: Uint32Array
  /** The M3/M4 S value in force per move (0 = off), or null if the file never turns a tool on */
  power: Float32Array | null
  /** The slicer's line width for each move in hundredths of a mm, from ;WIDTH: lines. 0 = the file didn't say. */
  widths: Uint8Array
  /** FEATURE_ code of each move: outer wall, inner wall, fill, support (FEATURE_UNKNOWN when the file doesn't say) */
  features: Uint8Array
  /** Nozzle size in mm, if the file says, as a fallback for the line width */
  nozzle: number | null
  /** First move of each layer, and its height */
  layerStarts: Uint32Array
  layerZ: Float32Array
  layerSource: LayerSource
  /** Where the work happens: what prints, else what cuts with power on, else what feeds, else any move */
  bounds: GcodeBounds | null
  hasExtrusion: boolean
  /** From a Studio file's header: "fdm", "laser", "cnc" and so on. Null for files from elsewhere. */
  process: string | null
  /** The material, from START_JOB MATERIAL= or the slicer's filament_type. Null if the file doesn't say. */
  material: string | null
  stats: {
    bytes: number
    lines: number
    /** Macros, T commands and bare coordinate lines: skipped, so the drawing can differ from the job there */
    skipped: number
    /** S on a move line, which Klipper ignores */
    ignoredPower: number
    /** Arcs outside the XY plane or with an impossible radius, drawn as straight lines */
    straightArcs: number
  }
}

const HAS_X = 1
const HAS_Y = 2
const HAS_Z = 4
const HAS_E = 8
const HAS_I = 16
const HAS_J = 32
const HAS_R = 64
const HAS_S = 128

/** Largest gap between an arc and its drawn chords, in mm */
const ARC_TOLERANCE = 0.05
const ARC_MAX_CHORDS = 256
/** A rise or depth change smaller than this isn't a new layer, so vase mode doesn't make one per move */
const LAYER_MIN_STEP = 0.05
const INCH = 25.4
const MAX_FILE_BYTES = 2 ** 32

const NL = 10
const SEMICOLON = 59
const SPACE = 32
const TAB = 9

class Box {
  min: [number, number, number] = [Infinity, Infinity, Infinity]
  max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  used = false
  add(x: number, y: number, z: number) {
    this.used = true
    if (x < this.min[0]) this.min[0] = x
    if (y < this.min[1]) this.min[1] = y
    if (z < this.min[2]) this.min[2] = z
    if (x > this.max[0]) this.max[0] = x
    if (y > this.max[1]) this.max[1] = y
    if (z > this.max[2]) this.max[2] = z
  }
}

const LAYER_CHANGE = [...'LAYER_CHANGE'].map((c) => c.charCodeAt(0))
const LAYER_COLON = [...'LAYER:'].map((c) => c.charCodeAt(0))
const RHINO_PROCESS = [...'rhino_process'].map((c) => c.charCodeAt(0))
const RHINO_SETTINGS = [...'rhino_settings'].map((c) => c.charCodeAt(0))
const WIDTH = [...'WIDTH:'].map((c) => c.charCodeAt(0))
const START_JOB = [...'START_JOB'].map((c) => c.charCodeAt(0))
const FILAMENT_TYPE = [...'filament_type'].map((c) => c.charCodeAt(0))
const TYPE_COLON = [...'TYPE:'].map((c) => c.charCodeAt(0))
const FEATURE_WORD = [...'feature '].map((c) => c.charCodeAt(0))
const NOZZLE_DIAMETER = [...'nozzle_diameter'].map((c) => c.charCodeAt(0))

export class GcodeParser {
  private cap = 1 << 16
  private segs = new Float32Array(this.cap * 6)
  private kinds = new Uint8Array(this.cap)
  private offs = new Uint32Array(this.cap)
  private wids = new Uint8Array(this.cap)
  private feats = new Uint8Array(this.cap)
  private feature = FEATURE_UNKNOWN
  private width = 0
  private nozzle: number | null = null
  private pow: Float32Array | null = null
  private n = 0

  private x = NaN
  private y = NaN
  private z = NaN
  private e = 0
  private absolute = true
  private absoluteE = true
  private scale = 1
  private xyPlane = true
  private toolPower = 0
  private lastS = 0

  // Words of the line being read
  private has = 0
  private wx = 0
  private wy = 0
  private wz = 0
  private we = 0
  private wi = 0
  private wj = 0
  private wr = 0
  private ws = 0
  private num = 0

  // Three ways of finding layers, chosen between at the end
  private markerStarts: number[] = []
  private markerZ: number[] = []
  private markerPending = false
  private extrudeStarts: number[] = []
  private extrudeZ: number[] = []
  private depthStarts: number[] = []
  private depthZ: number[] = []

  private boxExtrude = new Box()
  private boxPowered = new Box()
  private boxFeed = new Box()
  private boxAny = new Box()

  private process: string | null = null
  private material: string | null = null
  private leftover: Uint8Array | null = null
  private consumed = 0
  private lines = 0
  private skipped = 0
  private ignoredPower = 0
  private straightArcs = 0

  /** Feed the next chunk of the file. Chunks can split a line anywhere. */
  push(chunk: Uint8Array): void {
    if (this.consumed + chunk.length > MAX_FILE_BYTES) throw new Error('This file is over 4 GB, too big to preview.')
    let start = 0
    if (this.leftover) {
      const nl = chunk.indexOf(NL)
      if (nl < 0) {
        const joined = new Uint8Array(this.leftover.length + chunk.length)
        joined.set(this.leftover)
        joined.set(chunk, this.leftover.length)
        this.leftover = joined
        this.consumed += chunk.length
        return
      }
      const line = new Uint8Array(this.leftover.length + nl)
      line.set(this.leftover)
      line.set(chunk.subarray(0, nl), this.leftover.length)
      this.line(line, 0, line.length, this.consumed - this.leftover.length)
      this.leftover = null
      start = nl + 1
    }
    for (;;) {
      const nl = chunk.indexOf(NL, start)
      if (nl < 0) break
      this.line(chunk, start, nl, this.consumed + start)
      start = nl + 1
    }
    if (start < chunk.length) this.leftover = chunk.slice(start)
    this.consumed += chunk.length
  }

  /** Read the last line and return the result. The parser can't be used after this. */
  finish(): ParsedGcode {
    if (this.leftover) {
      const l = this.leftover
      this.line(l, 0, l.length, this.consumed - l.length)
      this.leftover = null
    }
    const n = this.n
    const hasExtrusion = this.boxExtrude.used
    const box = hasExtrusion ? this.boxExtrude : this.boxPowered.used ? this.boxPowered : this.boxFeed.used ? this.boxFeed : this.boxAny

    let starts: number[]
    let zs: number[]
    let layerSource: LayerSource
    if (this.markerStarts.length) [starts, zs, layerSource] = [this.markerStarts, this.markerZ, 'markers']
    else if (this.extrudeStarts.length) [starts, zs, layerSource] = [this.extrudeStarts, this.extrudeZ, 'extrusion']
    else if (this.depthStarts.length) [starts, zs, layerSource] = [this.depthStarts, this.depthZ, 'depth']
    else [starts, zs, layerSource] = [n ? [0] : [], [], 'none']

    const layerStarts = new Uint32Array(starts.length)
    const layerZ = new Float32Array(starts.length)
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i]!
      layerStarts[i] = s
      // A marker's height is its first printed move; with none, the first move's end
      const z = zs[i]
      layerZ[i] = z !== undefined && !Number.isNaN(z) ? z : s < n ? this.segs[s * 6 + 5]! : 0
    }

    return {
      moveCount: n,
      segments: this.segs.slice(0, n * 6),
      kinds: this.kinds.slice(0, n),
      offsets: this.offs.slice(0, n),
      power: this.pow ? this.pow.slice(0, n) : null,
      widths: this.wids.slice(0, n),
      features: this.feats.slice(0, n),
      nozzle: this.nozzle,
      layerStarts,
      layerZ,
      layerSource,
      bounds: box.used ? { min: box.min, max: box.max } : null,
      hasExtrusion,
      process: this.process,
      material: this.material,
      stats: { bytes: this.consumed, lines: this.lines, skipped: this.skipped, ignoredPower: this.ignoredPower, straightArcs: this.straightArcs },
    }
  }

  private line(b: Uint8Array, start: number, end: number, offset: number): void {
    this.lines++
    let i = start
    while (i < end && (b[i] === SPACE || b[i] === TAB)) i++
    if (i >= end || b[i] === 13) return
    if (b[i] === SEMICOLON) {
      this.comment(b, i + 1, end)
      return
    }
    // A line number, as in "N120 G1 X5"
    if ((b[i]! | 32) === 110 && isDigit(b[i + 1])) {
      i++
      while (i < end && isDigit(b[i])) i++
      while (i < end && (b[i] === SPACE || b[i] === TAB)) i++
      if (i >= end) return
    }
    const letter = b[i]! | 32
    if (this.material === null && startsWith(b, i, end, START_JOB)) {
      const m = /\bMATERIAL=(\S+)/i.exec(new TextDecoder().decode(b.subarray(i, end)))
      if (m) this.material = m[1]!
    }
    if ((letter !== 103 && letter !== 109) || !isDigit(b[i + 1])) {
      this.skipped++
      return
    }
    i++
    let code = 0
    while (i < end && isDigit(b[i])) code = code * 10 + b[i++]! - 48
    // G38.2, or a macro whose name starts like a command (G1_LIFT): not a plain G or M code
    if (i < end && (b[i] === 46 || b[i] === 95)) {
      this.skipped++
      return
    }
    if (letter === 109) this.mCode(code, b, i, end)
    else this.gCode(code, b, i, end, offset)
  }

  private comment(b: Uint8Array, start: number, end: number): void {
    let i = start
    while (i < end && b[i] === SPACE) i++
    if (startsWith(b, i, end, LAYER_CHANGE) || startsWith(b, i, end, LAYER_COLON)) this.markerPending = true
    else if (startsWith(b, i, end, TYPE_COLON)) this.feature = featureOf(new TextDecoder().decode(b.subarray(i + TYPE_COLON.length, end)))
    else if (startsWith(b, i, end, FEATURE_WORD)) this.feature = featureOf(new TextDecoder().decode(b.subarray(i + FEATURE_WORD.length, end)))
    else if (startsWith(b, i, end, WIDTH)) {
      const at = i + WIDTH.length
      if (this.number(b, at, end) !== at && this.num > 0) this.width = Math.min(255, Math.round(this.num * 100))
    } else if (this.process === null && startsWith(b, i, end, RHINO_PROCESS)) {
      const m = /^rhino_process\s*=\s*(\S+)/.exec(new TextDecoder().decode(b.subarray(i, end)))
      if (m) this.process = m[1]!
    } else if (this.material === null && startsWith(b, i, end, FILAMENT_TYPE)) {
      // "filament_type = PETG;PLA": one per extruder, the first is the one in use
      const m = /^filament_type\s*=\s*([^;,\s]+)/.exec(new TextDecoder().decode(b.subarray(i, end)))
      if (m) this.material = m[1]!
    } else if (this.nozzle === null && startsWith(b, i, end, NOZZLE_DIAMETER)) {
      // "nozzle_diameter = 0.4,0.4": one value per extruder, and the first is the one in use on this machine
      const m = /^nozzle_diameter\s*=\s*([\d.]+)/.exec(new TextDecoder().decode(b.subarray(i, end)))
      if (m && +m[1]! > 0) this.nozzle = +m[1]!
    } else if (this.nozzle === null && startsWith(b, i, end, RHINO_SETTINGS)) {
      const m = /"nozzle":\s*([\d.]+)/.exec(new TextDecoder().decode(b.subarray(i, end)))
      if (m && +m[1]! > 0) this.nozzle = +m[1]!
    }
  }

  private mCode(code: number, b: Uint8Array, start: number, end: number): void {
    if (code === 82) this.absoluteE = true
    else if (code === 83) this.absoluteE = false
    else if (code === 3 || code === 4) {
      this.words(b, start, end)
      if (this.has & HAS_S) this.lastS = this.ws
      // M3 with no S keeps the last power; with none set, the tool is still on, so draw it as on
      this.toolPower = this.lastS > 0 ? this.lastS : 1
      if (!this.pow) this.pow = new Float32Array(this.cap)
    } else if (code === 5) this.toolPower = 0
  }

  private gCode(code: number, b: Uint8Array, start: number, end: number, offset: number): void {
    switch (code) {
      case 0:
      case 1:
      case 2:
      case 3:
        this.words(b, start, end)
        if (this.has & HAS_S) this.ignoredPower++
        this.move(code, offset)
        break
      case 17:
        this.xyPlane = true
        break
      case 18:
      case 19:
        this.xyPlane = false
        break
      case 20:
        this.scale = INCH
        break
      case 21:
        this.scale = 1
        break
      case 90:
        this.absolute = true
        break
      case 91:
        this.absolute = false
        break
      case 28: {
        // Homing puts the head somewhere only Klipper knows, so don't draw a line from where it was
        this.words(b, start, end)
        const all = (this.has & (HAS_X | HAS_Y | HAS_Z)) === 0
        if (all || this.has & HAS_X) this.x = NaN
        if (all || this.has & HAS_Y) this.y = NaN
        if (all || this.has & HAS_Z) this.z = NaN
        break
      }
      case 92:
        this.words(b, start, end)
        if (this.has === 0) {
          this.x = this.y = this.z = this.e = 0
        } else {
          if (this.has & HAS_X) this.x = this.wx * this.scale
          if (this.has & HAS_Y) this.y = this.wy * this.scale
          if (this.has & HAS_Z) this.z = this.wz * this.scale
          if (this.has & HAS_E) this.e = this.we * this.scale
        }
        break
      default:
        break
    }
  }

  /** Reads the letter-and-number words of a line up to any comment. "G1X5Y-2.5" and "g1 x5" both work. */
  private words(b: Uint8Array, start: number, end: number): void {
    this.has = 0
    let i = start
    while (i < end) {
      const c = b[i]!
      if (c === SEMICOLON || c === 42) break
      const low = c | 32
      i++
      if (low < 97 || low > 122) continue
      const next = this.number(b, i, end)
      if (next === i) continue
      i = next
      switch (low) {
        case 120: this.wx = this.num; this.has |= HAS_X; break
        case 121: this.wy = this.num; this.has |= HAS_Y; break
        case 122: this.wz = this.num; this.has |= HAS_Z; break
        case 101: this.we = this.num; this.has |= HAS_E; break
        case 105: this.wi = this.num; this.has |= HAS_I; break
        case 106: this.wj = this.num; this.has |= HAS_J; break
        case 114: this.wr = this.num; this.has |= HAS_R; break
        case 115: this.ws = this.num; this.has |= HAS_S; break
        default: break
      }
    }
  }

  /** Reads a number into this.num and returns the index after it, or `start` if there isn't one */
  private number(b: Uint8Array, start: number, end: number): number {
    let i = start
    let neg = false
    if (b[i] === 45) {
      neg = true
      i++
    } else if (b[i] === 43) i++
    let v = 0
    let div = 0
    let digits = 0
    for (; i < end; i++) {
      const d = b[i]!
      if (d >= 48 && d <= 57) {
        v = v * 10 + d - 48
        div *= 10
        digits++
      } else if (d === 46 && div === 0) div = 1
      else break
    }
    if (!digits) return start
    if (div > 1) v /= div
    this.num = neg ? -v : v
    return i
  }

  private move(code: number, offset: number): void {
    const has = this.has
    const s = this.scale
    const rel = !this.absolute
    const x0 = this.x
    const y0 = this.y
    const z0 = this.z
    const tx = has & HAS_X ? (rel ? x0 + this.wx * s : this.wx * s) : x0
    const ty = has & HAS_Y ? (rel ? y0 + this.wy * s : this.wy * s) : y0
    const tz = has & HAS_Z ? (rel ? (Number.isNaN(z0) ? 0 : z0) + this.wz * s : this.wz * s) : z0

    let de = 0
    if (has & HAS_E) {
      const v = this.we * s
      if (rel || !this.absoluteE) {
        de = v
        this.e += v
      } else {
        de = v - this.e
        this.e = v
      }
    }

    this.x = tx
    this.y = ty
    this.z = tz
    // Nowhere to draw from yet, as at the start of a file or after homing
    if (Number.isNaN(x0) || Number.isNaN(y0) || Number.isNaN(tx) || Number.isNaN(ty)) return

    const toZ = Number.isNaN(tz) ? 0 : tz
    const fromZ = Number.isNaN(z0) ? toZ : z0
    const isArc = (code === 2 || code === 3) && (has & (HAS_I | HAS_J | HAS_R)) !== 0
    if (!isArc && tx === x0 && ty === y0 && toZ === fromZ) return

    const kind = de > 0 ? MOVE_EXTRUDE : code === 0 ? MOVE_RAPID : MOVE_FEED
    if (isArc) this.arc(code === 2, x0, y0, fromZ, tx, ty, toZ, kind, offset)
    else this.emit(x0, y0, fromZ, tx, ty, toZ, kind, offset)
  }

  private arc(clockwise: boolean, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: number, offset: number): void {
    let cx: number
    let cy: number
    if (!this.xyPlane) {
      this.straightArcs++
      this.emit(x0, y0, z0, x1, y1, z1, kind, offset)
      return
    }
    if (this.has & HAS_R) {
      const r = this.wr * this.scale
      const dx = x1 - x0
      const dy = y1 - y0
      const d = Math.hypot(dx, dy)
      const h2 = r * r - (d * d) / 4
      if (d === 0 || h2 < -1e-6) {
        this.straightArcs++
        this.emit(x0, y0, z0, x1, y1, z1, kind, offset)
        return
      }
      // The two possible centres sit either side of the chord; negative R asks for the long way round
      const h = Math.sqrt(Math.max(0, h2)) * (clockwise === r > 0 ? 1 : -1)
      cx = (x0 + x1) / 2 + (h * dy) / d
      cy = (y0 + y1) / 2 - (h * dx) / d
    } else {
      cx = x0 + (this.has & HAS_I ? this.wi * this.scale : 0)
      cy = y0 + (this.has & HAS_J ? this.wj * this.scale : 0)
    }
    const radius = Math.hypot(x0 - cx, y0 - cy)
    if (radius === 0) {
      this.straightArcs++
      this.emit(x0, y0, z0, x1, y1, z1, kind, offset)
      return
    }
    const a0 = Math.atan2(y0 - cy, x0 - cx)
    let sweep = Math.atan2(y1 - cy, x1 - cx) - a0
    if (clockwise && sweep >= 0) sweep -= 2 * Math.PI
    else if (!clockwise && sweep <= 0) sweep += 2 * Math.PI

    const maxStep = radius <= ARC_TOLERANCE ? Math.PI / 2 : 2 * Math.acos(1 - ARC_TOLERANCE / radius)
    const chords = Math.min(ARC_MAX_CHORDS, Math.max(1, Math.ceil(Math.abs(sweep) / maxStep)))
    let px = x0
    let py = y0
    let pz = z0
    for (let k = 1; k <= chords; k++) {
      const f = k / chords
      const a = a0 + sweep * f
      // The last chord lands exactly on the file's end point
      const nx = k === chords ? x1 : cx + radius * Math.cos(a)
      const ny = k === chords ? y1 : cy + radius * Math.sin(a)
      const nz = z0 + (z1 - z0) * f
      this.emit(px, py, pz, nx, ny, nz, kind, offset)
      px = nx
      py = ny
      pz = nz
    }
  }

  private emit(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: number, offset: number): void {
    if (this.n === this.cap) this.grow()
    const n = this.n
    const j = n * 6
    const segs = this.segs
    segs[j] = x0
    segs[j + 1] = y0
    segs[j + 2] = z0
    segs[j + 3] = x1
    segs[j + 4] = y1
    segs[j + 5] = z1
    this.kinds[n] = kind
    this.offs[n] = offset
    if (kind === MOVE_EXTRUDE) {
      this.wids[n] = this.width
      this.feats[n] = this.feature
    }
    if (this.pow) this.pow[n] = this.toolPower

    this.boxAny.add(x0, y0, z0)
    this.boxAny.add(x1, y1, z1)
    if (kind === MOVE_EXTRUDE) {
      this.boxExtrude.add(x0, y0, z0)
      this.boxExtrude.add(x1, y1, z1)
    } else {
      if (kind === MOVE_FEED) {
        this.boxFeed.add(x0, y0, z0)
        this.boxFeed.add(x1, y1, z1)
      }
      // A G0 with the tool on still cuts: to Klipper, G0 and G1 are the same move
      if (this.toolPower > 0) {
        this.boxPowered.add(x0, y0, z0)
        this.boxPowered.add(x1, y1, z1)
      }
    }

    if (this.markerPending) {
      this.markerPending = false
      this.markerStarts.push(n)
      this.markerZ.push(NaN)
    }
    if (kind === MOVE_EXTRUDE) {
      const last = this.markerZ.length - 1
      if (last >= 0 && Number.isNaN(this.markerZ[last]!)) this.markerZ[last] = z1
      const top = this.extrudeZ[this.extrudeZ.length - 1]
      if (top === undefined || z1 > top + LAYER_MIN_STEP) {
        this.extrudeStarts.push(n)
        this.extrudeZ.push(z1)
      }
    } else if (kind === MOVE_FEED && z0 === z1) {
      // Level cuts only: a plunge or ramp between depths isn't a pass of its own
      const level = this.depthZ[this.depthZ.length - 1]
      if (level === undefined || Math.abs(z1 - level) > LAYER_MIN_STEP) {
        this.depthStarts.push(n)
        this.depthZ.push(z1)
      }
    }
    this.n = n + 1
  }

  private grow(): void {
    // Copying with set(), never by spreading: a spread of a big array overflows the call stack
    this.cap *= 2
    const segs = new Float32Array(this.cap * 6)
    segs.set(this.segs)
    this.segs = segs
    const kinds = new Uint8Array(this.cap)
    kinds.set(this.kinds)
    this.kinds = kinds
    const offs = new Uint32Array(this.cap)
    offs.set(this.offs)
    this.offs = offs
    const wids = new Uint8Array(this.cap)
    wids.set(this.wids)
    this.wids = wids
    const feats = new Uint8Array(this.cap)
    feats.set(this.feats)
    this.feats = feats
    if (this.pow) {
      const pow = new Float32Array(this.cap)
      pow.set(this.pow)
      this.pow = pow
    }
  }
}

function isDigit(c: number | undefined): boolean {
  return c !== undefined && c >= 48 && c <= 57
}

function startsWith(b: Uint8Array, at: number, end: number, word: number[]): boolean {
  if (end - at < word.length) return false
  for (let k = 0; k < word.length; k++) if (b[at + k] !== word[k]) return false
  return true
}

/** The whole file in one call, for text already in memory and for tests */
export function parseGcode(input: string | Uint8Array): ParsedGcode {
  const p = new GcodeParser()
  p.push(typeof input === 'string' ? new TextEncoder().encode(input) : input)
  return p.finish()
}
