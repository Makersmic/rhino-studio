/**
 * A job prepared in Studio: which toolhead, which material, the settings that
 * matter for that process, and where the part sits. Everything here is plain
 * data, saved as JSON (schema 1) and turned into Kiri:Moto settings by
 * kiriSettings.ts. Studio never slices on the Pi: Kiri:Moto runs in this
 * browser (see engine.ts).
 */

export type Process = 'fdm' | 'laser' | 'dragknife' | 'cnc'

export interface FdmSettings {
  nozzle: number
  /** SwitchFly's filament path (EXTRUDER= in START_JOB); 0 for BlockOne */
  path: 0 | 1
  layerHeight: number
  firstLayer: number
  walls: number
  topLayers: number
  bottomLayers: number
  /** 0..1 */
  infill: number
  infillType: 'grid' | 'gyroid' | 'hex' | 'linear' | 'triangle'
  supports: boolean
  /** skirt loops around the first layer, 0 = none (with skirtGap 0 it's a brim) */
  brim: number
  /** mm/s for walls and infill */
  speed: number
  /** mm/s, first layer */
  firstLayerSpeed: number
  /** mm, at each travel */
  retract: number
  /** 0..1, from layer 2 */
  fan: number

  // ---- Advanced (Kiri:Moto's own names in kiriSettings.ts)
  /** mm, 0 = the nozzle size */
  lineWidth: number
  /** thinner layers where the surface curves */
  adaptive: boolean
  minLayer: number
  wallOrder: 'in-out' | 'out-in' | 'alternate'
  /** where each layer starts */
  seam: 'last' | 'center' | 'origin' | 'random' | 'spiral'
  thinWalls: 'off' | 'basic' | 'adaptive'
  /** degrees */
  fillAngle: number
  /** 0..1 of a line width */
  fillOverlap: number
  /** mm/s */
  outerSpeed: number
  travelSpeed: number
  minSpeed: number
  /** mm³/s */
  maxFlow: number
  /** mm/s */
  retractSpeed: number
  /** mm, 0 = off */
  zHop: number
  wipe: number
  coast: number
  retractEachLayer: boolean
  avoidCrossing: boolean
  supportAngle: number
  /** 0..1 */
  supportDensity: number
  /** mm between support and part, sideways */
  supportGapXY: number
  /** a layer gap between support and part */
  supportGapZ: boolean
  supportOutline: boolean
  fanFromLayer: number
  /** seconds */
  minLayerTime: number
  /** mm from the part; 0 makes the skirt a brim */
  skirtGap: number
  raft: boolean
  raftSpacing: number
  /** one continuous wall, no top or infill */
  vase: boolean
}

export interface LaserSettings {
  /** 0..1 of the laser's full power (laser_s_max) */
  power: number
  /** mm/min while cutting */
  feed: number
  /** the whole cut is repeated this many times */
  passes: number
  /** height above the bed the part's outline is taken at (3D models) */
  cutHeight: number
  /** mm the outline is offset to allow for the beam's width */
  kerf: number
  /** mm, merges tiny segments (0 = off) */
  smooth: number
  /** cut only the outermost outline (no holes) */
  outerOnly: boolean
}

export interface KnifeSettings {
  feed: number
  /** mm below the surface, per pass */
  depth: number
  passes: number
  /** mm from the knife's axis to the blade tip (swivel offset) */
  tip: number
  /** mm/min when the blade goes into the material */
  plunge: number
  cutHeight: number
  smooth: number
  outerOnly: boolean
}

export type CncOperation = 'cutout' | 'clear-and-cutout'

/**
 * One step of a CNC job, run in list order with the job's one tool:
 *   level    take the top of the stock down flat (needs stock above the part)
 *   rough    clear material around and inside the part, leaving a little
 *   outline  trace the part's outline, outside (cut out) or inside
 *
 * (Kiri:Moto's 3D contour finishing needs the browser's SharedArrayBuffer, which
 * only works on a page served with cross-origin isolation headers; that would
 * block cameras on other addresses, so it isn't offered yet.)
 */
export interface CncOp {
  kind: 'level' | 'rough' | 'outline'
  on: boolean
  /** mm per pass down (level, rough, outline) */
  stepDown: number
  /** 0..1 of the tool diameter (level, rough) */
  stepOver: number
  /** mm/min, 0 = the job's feed */
  feed: number
  /** mm left for a finishing pass (rough) */
  leave: number
  /** mm to take off the stock top (level) */
  depth: number
  side: 'outside' | 'inside'
  direction: 'climb' | 'conventional'
}

export interface CncSettings {
  /** older jobs: became ops */
  operation?: CncOperation
  ops: CncOp[]
  toolType: 'endmill' | 'ballmill'
  toolDiameter: number
  /** mm of cutting length: nothing cuts deeper than this */
  fluteLength: number
  /** mm of stock above the part's top (leveled off by a level step) */
  extraTop: number
  /** mm per pass */
  stepDown: number
  /** 0..1 of the tool diameter, for clearing */
  stepOver: number
  /** mm/min */
  feed: number
  plunge: number
  /** stock around the part, each side (mm) */
  margin: number
  /** mm above the stock for moves between cuts */
  clearance: number
}

export interface Placement {
  /** centre of the part on the bed (machine X/Y, mm). Not used for CNC (work zero is the stock corner). */
  x: number
  y: number
  /** turn around Z, degrees */
  rotate: number
  /** 1 = as drawn */
  scale: number
}

export interface PrepareJob {
  schema: 1
  toolhead: string
  process: Process
  /** key in the tool's materials table (variables.cfg), e.g. PLA, PLYWOOD, SOFT_WOOD */
  material: string
  /**
   * FDM engine: 'prusa' = PrusaSlicer on the Rhino (through the Portal, every
   * PrusaSlicer option, src/slicer/prusa), 'kiri' = Kiri:Moto in this browser
   * (the fdm settings below). Older jobs: kiri.
   */
  engine?: 'prusa' | 'kiri'
  /** PrusaSlicer options the user changed (INI values, single extruder) */
  prusa?: Record<string, string>
  fdm: FdmSettings
  laser: LaserSettings
  knife: KnifeSettings
  cnc: CncSettings
  placement: Placement
  /** Phase 1: the profile on the Rhino these settings came from (builtin:<process> = the defaults) */
  profileId?: string | null
  /** its revision when this job was set up */
  profileRev?: number | null
}

/** What Studio knows about the machine, read live from Klipper when connected. */
export interface MachineInfo {
  /** Klipper's travel limits (toolhead.axis_minimum / axis_maximum) */
  travelMin: [number, number, number]
  travelMax: [number, number, number]
  /** where parts may go: the X endstop sits at 550, so not the full 576 */
  workArea: { x: number; y: number }
  /** VARIABLES.laser_s_max: M3 S at full power */
  laserSMax: number
  /** RHINO_POSITIONS prime line, if the config has it */
  prime: { x: number; y: number; length: number } | null
  /** places on the bed nothing may print or cut over (machine X/Y, mm) */
  keepOut: KeepOut[]
}

export interface KeepOut {
  x0: number
  y0: number
  x1: number
  y1: number
  label: string
}

export const DEFAULT_MACHINE: MachineInfo = {
  travelMin: [0, 0, -10],
  travelMax: [576, 406, 295],
  workArea: { x: 550, y: 375 },
  laserSMax: 1000,
  prime: { x: 5, y: 10, length: 120 },
  // A Z leadscrew comes up through the bed here (the Orca profile's bed exclude area 450x300 - 550x350)
  keepOut: [{ x0: 450, y0: 300, x1: 550, y1: 350, label: 'Leadscrew' }],
}

/** The part as loaded, after rotate and scale, centred on X/Y with its bottom at Z 0. */
export interface PartInfo {
  name: string
  /** size in mm */
  size: { x: number; y: number; z: number }
  triangles: number
  /** outline seen from above (convex hull), relative to the part's centre */
  footprint: Array<[number, number]>
  /** flat drawing (SVG/DXF), extruded by the loader */
  flat: boolean
}
