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
import type { CncOp, CncSettings, MachineInfo, PartInfo, PrepareJob } from './types'

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
          sliceFillType: f.vase ? 'vase' : f.infill > 0 ? f.infillType : 'none',
          sliceSupportType: f.supports ? 'automatic' : 'disabled',
          sliceSupportAngle: f.supportAngle,
          sliceSupportDensity: f.supportDensity,
          sliceSupportOffset: f.supportGapXY,
          sliceSupportGap: f.supportGapZ,
          sliceSupportOutline: f.supportOutline,
          sliceLineWidth: f.lineWidth,
          sliceAdaptive: f.adaptive,
          sliceMinHeight: f.adaptive ? f.minLayer : 0,
          sliceShellOrder: f.wallOrder,
          sliceLayerStart: f.seam,
          sliceDetectThin: f.thinWalls,
          sliceFillAngle: f.fillAngle,
          sliceFillOverlap: f.fillOverlap,
          outputFeedrate: f.speed,
          outputFinishrate: f.outerSpeed,
          outputSeekrate: f.travelSpeed,
          outputMinSpeed: f.minSpeed,
          outputMaxFlowrate: f.maxFlow,
          firstLayerRate: f.firstLayerSpeed,
          firstLayerFillRate: f.firstLayerSpeed,
          outputRetractDist: f.retract,
          outputRetractSpeed: f.retractSpeed,
          outputRetractDwell: 0,
          outputRetractWipe: f.wipe,
          outputCoastDist: f.coast,
          outputLayerRetract: f.retractEachLayer,
          outputAvoidGaps: f.avoidCrossing,
          outputFanSpeed: Math.round(Math.max(0, Math.min(1, f.fan)) * 255),
          outputFanLayer: f.fanFromLayer,
          outputMinLayerTime: f.minLayerTime,
          firstLayerFanSpeed: 0,
          // On a flat (not belt) bed Kiri's "brim count" is the skirt; a 0 mm gap makes it a brim
          outputBrimCount: f.brim,
          outputBrimOffset: f.skirtGap,
          outputRaft: f.raft,
          outputRaftSpacing: f.raftSpacing,
          // temperatures come from the material table through START_JOB / PREHEAT, never from the file
          outputTemp: 0,
          outputBedTemp: 0,
          firstLayerNozzleTemp: 0,
          firstLayerBedTemp: 0,
          antiBacklash: 0,
          zHopDistance: f.zHop,
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
          ctOutSmooth: l.smooth,
          ctOmitInner: l.outerOnly,
          ctOriginCenter: false,
          ctOriginBounds: true,
          ctOutStack: false,
          ctOutGroup: true,
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
          ctOutSmooth: k.smooth,
          ctOmitInner: k.outerOnly,
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
        name: `${c.toolDiameter} mm ${c.toolType === 'ballmill' ? 'ball' : 'end'} mill`,
        type: c.toolType,
        metric: true,
        shaft_diam: c.toolDiameter,
        shaft_len: 20,
        flute_diam: c.toolDiameter,
        flute_len: c.fluteLength,
        taper_tip: 0,
      }
      const ops = c.ops.filter((o) => o.on && (o.kind !== 'level' || c.extraTop > 0)).map((o) => cncOp(o, c))
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
          ops,
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
  return { x: r3(part.size.x + 2 * m), y: r3(part.size.y + 2 * m), z: r3(part.size.z + Math.max(0, job.cnc.extraTop ?? 0)) }
}

/** One Studio CNC step -> Kiri's operation record (field names from Kiri's own op editor) */
export function cncOp(o: CncOp, c: CncSettings): Record<string, unknown> {
  const rate = o.feed > 0 ? o.feed : c.feed
  const common = { tool: 1000, spindle: 0, rate, plunge: c.plunge, direction: o.direction, ov_topz: 0, ov_botz: 0 }
  switch (o.kind) {
    case 'level':
      // only the stock above the part: never deeper than the extra stock
      return { ...common, type: 'level', step: o.stepOver, stepz: o.stepDown, down: r3(Math.min(o.depth, c.extraTop)), inset: 0.5, stock: true }
    case 'rough':
      return { ...common, type: 'rough', down: o.stepDown, step: o.stepOver, leave: o.leave, leavez: 0, all: false, flats: true, inside: true, omitthru: false }
    case 'outline':
      return { ...common, type: 'outline', down: o.stepDown, step: 0.4, steps: 1, outside: o.side === 'outside', inside: o.side === 'inside', omitthru: false, omitvoid: false, wide: false, dogbones: false, revbones: false }
  }
}

/** Where to take the outline: inside the part, never above its top. */
export function cutHeight(want: number, part: PartInfo): number {
  const h = part.size.z
  if (!(h > 0)) return 0
  return r3(Math.max(Math.min(want, h - 0.01), Math.min(0.01, h / 2)))
}
