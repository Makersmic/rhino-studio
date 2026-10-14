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
  /** brim loops, 0 = none */
  brim: number
  /** mm/s for walls and infill */
  speed: number
  /** mm/s, first layer */
  firstLayerSpeed: number
  /** mm, at each travel */
  retract: number
  /** 0..1, from layer 2 */
  fan: number
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
}

export type CncOperation = 'cutout' | 'clear-and-cutout'

export interface CncSettings {
  operation: CncOperation
  toolDiameter: number
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
  fdm: FdmSettings
  laser: LaserSettings
  knife: KnifeSettings
  cnc: CncSettings
  placement: Placement
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
}

export const DEFAULT_MACHINE: MachineInfo = {
  travelMin: [0, 0, -10],
  travelMax: [576, 406, 295],
  workArea: { x: 550, y: 375 },
  laserSMax: 1000,
  prime: { x: 5, y: 10, length: 120 },
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
