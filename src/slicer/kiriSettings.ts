/**
 * A Studio job -> the settings Kiri:Moto's engine takes.
 *
 * How each process lands in machine terms (checked again in check.ts):
 *
 *   fdm        machine X/Y/Z. Kiri places the part relative to the middle of
 *              its bed, so the part is moved by (centre - bed/2).
 *   laser,     machine X/Y (the wizards clear any X/Y work zero). Kiri writes
 *   dragknife  the cut relative to its lower-left corner (ctOriginBounds);
 *              rhinoFile.ts then moves it to where it sits on the bed.
 *   cnc        work coordinates: X0 Y0 is the stock's front-left corner and Z0
 *              its top, set by CNC_JOB_SETUP. The stock is the part plus a
 *              margin each side, as thick as the part.
 *
 * Nothing that heats, homes or switches a tool on comes from Kiri: its start
 * and end code is empty, and rhinoFile.ts writes the Rhino's own lines.
 */
import type { MachineInfo, PartInfo, PrepareJob } from './types'

export type KiriMode = 'FDM' | 'LASER' | 'DRAG' | 'CAM'

export interface KiriJob {
  mode: KiriMode
  device: Record<string, unknown>
  process: Record<string, unknown>
  tools?: Array<Record<string, unknown>>
  stock?: { x: number; y: number; z: number; center: { x: number; y: number; z: number } }
  origin?: [number, number, number]
  /** move the (centred) part by this much before slicing */
  move?: [number, number, number]
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

export function kiriJob(job: PrepareJob, part: PartInfo, m: MachineInfo): KiriJob {
  const W = m.workArea.x
  const D = m.workArea.y
  switch (job.process) {
    case 'fdm': {
      const f = job.fdm
      return {
        mode: 'FDM',
        device: {
          bedWidth: W,
          bedDepth: D,
          maxHeight: m.travelMax[2],
          originCenter: false,
          gcodePre: [],
          gcodePost: [],
          gcodeFan: ['M106 S{fan_speed}'],
          gcodeLayer: [';LAYER_CHANGE', ';Z:{z}'],
          gcodeTrack: [],
          gcodeFeature: [],
          extruders: [{ extFilament: 1.75, extNozzle: f.nozzle, extOffsetX: 0, extOffsetY: 0 }],
        },
        process: {
          sliceHeight: f.layerHeight,
          firstSliceHeight: f.firstLayer,
          sliceShells: f.walls,
          sliceTopLayers: f.topLayers,
          sliceBottomLayers: f.bottomLayers,
          sliceFillSparse: f.infill,
          sliceFillType: f.infill > 0 ? f.infillType : 'none',
          sliceSupportType: f.supports ? 'automatic' : 'disabled',
          sliceLineWidth: 0,
          outputFeedrate: f.speed,
          outputFinishrate: f.speed,
          outputSeekrate: 150,
          firstLayerRate: f.firstLayerSpeed,
          firstLayerFillRate: f.firstLayerSpeed,
          outputRetractDist: f.retract,
          outputRetractSpeed: 30,
          outputRetractDwell: 0,
          outputFanSpeed: Math.round(Math.max(0, Math.min(1, f.fan)) * 255),
          outputFanLayer: 1,
          firstLayerFanSpeed: 0,
          outputBrimCount: f.brim,
          firstLayerBrim: f.brim,
          outputRaft: false,
          // temperatures come from the material table through START_JOB / PREHEAT, never from the file
          outputTemp: 0,
          outputBedTemp: 0,
          firstLayerNozzleTemp: 0,
          firstLayerBedTemp: 0,
          antiBacklash: 0,
          zHopDistance: 0,
        },
        move: [r3(job.placement.x - W / 2), r3(job.placement.y - D / 2), 0],
      }
    }
    case 'laser': {
      const l = job.laser
      return {
        mode: 'LASER',
        device: {
          bedWidth: W,
          bedDepth: D,
          laserMaxPower: m.laserSMax,
          gcodePre: [],
          gcodePost: [],
          gcodeSpace: true,
          gcodeLaserOn: ['M3 S{power}'],
          gcodeLaserOff: ['M5'],
        },
        process: {
          ctOutPower: r3(Math.max(0, Math.min(1, l.power)) * 100),
          ctOutSpeed: l.feed,
          ctSliceSingle: true,
          ctSliceHeight: cutHeight(l.cutHeight, part),
          ctSliceKerf: l.kerf,
          ctOriginCenter: false,
          ctOriginBounds: true,
          ctOutStack: false,
          ctOutGroup: true,
          ctOmitInner: false,
          outputInvertX: false,
          outputInvertY: false,
        },
      }
    }
    case 'dragknife': {
      const k = job.knife
      return {
        mode: 'DRAG',
        device: { bedWidth: W, bedDepth: D, gcodePre: [], gcodePost: [], gcodeSpace: true, gcodeKnifeDn: [], gcodeKnifeUp: [] },
        process: {
          ctOutSpeed: k.feed,
          ctOutKnifeDepth: k.depth,
          ctOutKnifePasses: k.passes,
          ctOutKnifeTip: k.tip,
          ctSliceSingle: true,
          ctSliceHeight: cutHeight(k.cutHeight, part),
          ctSliceKerf: 0,
          ctOriginCenter: false,
          ctOriginBounds: true,
          outputInvertX: false,
          outputInvertY: false,
        },
      }
    }
    case 'cnc': {
      const c = job.cnc
      const st = cncStock(job, part)
      const tool = {
        id: 1000,
        number: 1,
        name: `${c.toolDiameter} mm end mill`,
        type: 'endmill',
        metric: true,
        shaft_diam: c.toolDiameter,
        shaft_len: 20,
        flute_diam: c.toolDiameter,
        flute_len: Math.max(10, part.size.z + 2),
        taper_tip: 0,
      }
      const common = { tool: 1000, spindle: 0, down: c.stepDown, rate: c.feed, plunge: c.plunge, direction: 'climb', ov_topz: 0, ov_botz: 0 }
      const outline = { ...common, type: 'outline', step: 0.4, steps: 1, outside: true, inside: false, omitthru: false, omitvoid: false, wide: false, dogbones: false, revbones: false }
      const rough = { ...common, type: 'rough', step: c.stepOver, leave: 0.5, leavez: 0, all: false, flats: true, inside: true, omitthru: false }
      return {
        mode: 'CAM',
        device: {
          bedWidth: W,
          bedDepth: D,
          maxHeight: 100,
          originCenter: false,
          spindleMax: 0,
          gcodePre: [],
          gcodePost: [],
          gcodeSpindle: [],
          gcodeChange: [],
          gcodeDwell: ['G4 P{time}'],
          gcodeSpace: true,
          gcodeStrip: true,
        },
        process: {
          camOriginTop: true,
          camOriginCenter: false,
          camOriginOffX: 0,
          camOriginOffY: 0,
          camOriginOffZ: 0,
          camStockOffset: false,
          camStockX: st.x,
          camStockY: st.y,
          camStockZ: st.z,
          camZClearance: c.clearance,
          camZTop: 0,
          camZBottom: 0,
          camZThru: 0,
          camFastFeed: 3000,
          camFastFeedZ: 300,
          camDepthFirst: true,
          camEaseDown: false,
          camToolInit: false,
          ops: c.operation === 'clear-and-cutout' ? [rough, outline] : [outline],
        },
        tools: [tool],
        stock: { ...st, center: { x: 0, y: 0, z: r3(st.z / 2) } },
        // X0 Y0 at the stock's front-left corner, Z0 on its top
        origin: [r3(-st.x / 2), r3(st.y / 2), st.z],
      }
    }
  }
}

export function cncStock(job: PrepareJob, part: PartInfo): { x: number; y: number; z: number } {
  const m = Math.max(0, job.cnc.margin)
  return { x: r3(part.size.x + 2 * m), y: r3(part.size.y + 2 * m), z: r3(part.size.z) }
}

/** Where to take the outline: inside the part, never above its top. */
export function cutHeight(want: number, part: PartInfo): number {
  const h = part.size.z
  if (!(h > 0)) return 0
  return r3(Math.max(Math.min(want, h - 0.01), Math.min(0.01, h / 2)))
}
