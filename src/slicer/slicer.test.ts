import { describe, expect, it } from 'vitest'
import { applyMaterial, materialName, materialsFor, newJob, newOp, normalizeJob, parseMaterials, processFor } from './profiles'
import { cncStock, cutHeight, kiriJob } from './kiriSettings'
import { fileName, paLine, rhinoFile, shiftXY, xyBounds } from './rhinoFile'
import { blocking, checkFile } from './check'
import { footprint, merge, partInfo, transform } from './model'
import { DEFAULT_MACHINE, type PartInfo } from './types'

const cubeVerts = (s = 20, h = 10) => {
  // two triangles per face are enough for bounds / footprint tests
  const p = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, h], [s, 0, h], [s, s, h], [0, s, h],
  ]
  const tri = [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6]]
  return new Float32Array(tri.flatMap((t) => t.flatMap((i) => p[i]!)))
}
const part = (z = 10): PartInfo => ({ name: 'Bracket v2.stl', size: { x: 20, y: 20, z }, triangles: 12, footprint: [], flat: false })
const M = DEFAULT_MACHINE

describe('profiles', () => {
  it('maps tool types to processes', () => {
    expect(processFor('DEPOSITION')).toBe('fdm')
    expect(processFor('DRAG_KNIFE')).toBe('dragknife')
    expect(processFor('POWERED')).toBeNull()
  })
  it('reads material names and SwitchFly paths from table keys', () => {
    expect(materialName('PLA_0_4')).toBe('PLA')
    expect(materialName('PETG_0_8')).toBe('PETG')
    expect(materialName('PLA_0_4_T1')).toBe('PLA')
    expect(materialName('PLYWOOD')).toBe('PLYWOOD')
    const m = parseMaterials({ PLA_0_4_T1: { nozzle_size: 0.4, fan_speed: 0.5 }, junk: 3 })
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ key: 'PLA_0_4_T1', name: 'PLA', path: 1, nozzle: 0.4, fan: 0.5 })
  })
  it("prefers Klipper's table and falls back to the built-in one", () => {
    const live = materialsFor('LightSaber', { LightSaber: { materials: { CORK: { laser_power: 0.3, feed_rate: 900 } } } })
    expect(live.live).toBe(true)
    expect(live.list.map((x) => x.key)).toEqual(['CORK'])
    const off = materialsFor('LightSaber', null)
    expect(off.live).toBe(false)
    expect(off.list.map((x) => x.key)).toContain('PLYWOOD')
  })
  it('fills a new job from the first material', () => {
    const j = newJob('LightSaber', 'laser', materialsFor('LightSaber', null).list)
    expect(j.material).toBe('PLYWOOD')
    expect(j.laser.power).toBe(0.8)
    expect(j.laser.feed).toBe(600)
  })
  it('a 0.8 nozzle material switches to 0.4 mm layers, and back', () => {
    const list = materialsFor('BlockOne', null).list
    const j = newJob('BlockOne', 'fdm', list)
    applyMaterial(j, list.find((x) => x.key === 'PLA_0_8')!)
    expect(j.fdm.nozzle).toBe(0.8)
    expect(j.fdm.layerHeight).toBe(0.4)
    applyMaterial(j, list.find((x) => x.key === 'PLA_0_4')!)
    expect(j.fdm.layerHeight).toBe(0.2)
  })
})

describe('saved jobs from older Studio versions', () => {
  it('get the new settings, and the old CNC choice becomes steps', () => {
    const old = newJob('HotJoe', 'cnc', materialsFor('HotJoe', null).list) as unknown as Record<string, unknown>
    const cnc = { operation: 'clear-and-cutout', toolDiameter: 6, stepDown: 2, stepOver: 0.5, feed: 900, plunge: 150, margin: 4, clearance: 5 }
    const fdm = { nozzle: 0.4, path: 0, layerHeight: 0.28 }
    const j = normalizeJob({ ...old, cnc, fdm } as never)
    expect(j.cnc.ops.map((o) => o.kind)).toEqual(['rough', 'outline'])
    expect(j.cnc.ops[0]!.stepDown).toBe(2)
    expect(j.cnc.toolDiameter).toBe(6)
    expect(j.cnc.fluteLength).toBe(15)
    expect('operation' in j.cnc).toBe(false)
    expect(j.fdm.layerHeight).toBe(0.28)
    expect(j.fdm.seam).toBe('last')
    expect(j.laser.smooth).toBe(0.1)
  })
})

describe('kiriSettings', () => {
  it('FDM: no temperatures from the file, part moved from the bed centre', () => {
    const j = newJob('BlockOne', 'fdm', materialsFor('BlockOne', null).list)
    j.placement.x = 375
    j.placement.y = 237.5
    const k = kiriJob(j, part(), M)
    expect(k.mode).toBe('FDM')
    expect(k.move).toEqual([100, 50, 0])
    expect(k.process).toMatchObject({ outputTemp: 0, outputBedTemp: 0, firstLayerNozzleTemp: 0, firstLayerBedTemp: 0, outputRetractDwell: 0 })
    expect(k.device).toMatchObject({ bedWidth: 550, bedDepth: 375, maxHeight: 295, gcodePre: [], gcodePost: [] })
    expect(k.process.outputFanSpeed).toBe(128)
  })
  it('FDM advanced settings reach Kiri under its own names', () => {
    const j = newJob('BlockOne', 'fdm', materialsFor('BlockOne', null).list)
    Object.assign(j.fdm, { seam: 'random', wallOrder: 'out-in', zHop: 0.4, supports: true, supportAngle: 40, brim: 3, skirtGap: 0, vase: true, outerSpeed: 35, travelSpeed: 200 })
    expect(kiriJob(j, part(), M).process).toMatchObject({
      sliceLayerStart: 'random',
      sliceShellOrder: 'out-in',
      zHopDistance: 0.4,
      sliceSupportType: 'automatic',
      sliceSupportAngle: 40,
      outputBrimCount: 3,
      outputBrimOffset: 0,
      sliceFillType: 'vase',
      outputFinishrate: 35,
      outputSeekrate: 200,
    })
  })
  it('laser: power as % of laser_s_max, origin at the cut, no start/end code from Kiri', () => {
    const j = newJob('LightSaber', 'laser', materialsFor('LightSaber', null).list)
    const k = kiriJob(j, part(), M)
    expect(k.device).toMatchObject({ laserMaxPower: 1000, gcodeLaserOn: ['M3 S{power}'], gcodeLaserOff: ['M5'], gcodePre: [], gcodePost: [] })
    expect(k.process).toMatchObject({ ctOutPower: 80, ctOutSpeed: 600, ctOriginBounds: true, ctOriginCenter: false, ctSliceSingle: true })
  })
  it('cut height stays inside the part', () => {
    expect(cutHeight(1, part(10))).toBe(1)
    expect(cutHeight(50, part(3))).toBe(2.99)
    expect(cutHeight(1, part(0.5))).toBe(0.49)
  })
  it('CNC: stock = part + margin, origin at the stock corner and top', () => {
    const j = newJob('HotJoe', 'cnc', materialsFor('HotJoe', null).list)
    j.cnc.margin = 5
    const k = kiriJob(j, part(12), M)
    expect(cncStock(j, part(12))).toEqual({ x: 30, y: 30, z: 12 })
    expect(k.origin).toEqual([-15, 15, 12])
    expect(k.stock?.center).toEqual({ x: 0, y: 0, z: 6 })
    expect(k.process).toMatchObject({ camStockOffset: false, camOriginTop: true, camOriginCenter: false })
    expect(k.device).toMatchObject({ gcodeSpindle: [], gcodeChange: [] })
    expect((k.process.ops as Array<{ type: string }>).map((o) => o.type)).toEqual(['outline'])
    j.cnc.ops = [newOp('level'), newOp('rough'), newOp('outline'), { ...newOp('rough'), on: false }]
    // level needs stock above the part; switched-off steps are left out
    expect((kiriJob(j, part(12), M).process.ops as Array<{ type: string }>).map((o) => o.type)).toEqual(['rough', 'outline'])
    j.cnc.extraTop = 2
    const k2 = kiriJob(j, part(12), M)
    expect((k2.process.ops as Array<{ type: string }>).map((o) => o.type)).toEqual(['level', 'rough', 'outline'])
    expect(k2.origin).toEqual([-15, 15, 14])
    expect((k2.process.ops as Array<{ type: string; down?: number }>)[0]!.down).toBe(1)
    j.cnc.ops[0]!.depth = 5
    expect((kiriJob(j, part(12), M).process.ops as Array<{ down?: number }>)[0]!.down).toBe(2)
  })
})

describe('rhinoFile', () => {
  it('file names are safe for FILE=', () => {
    const j = newJob('LightSaber', 'laser', materialsFor('LightSaber', null).list)
    expect(fileName('My Sign (v2).svg', j)).toBe('My_Sign_v2-LightSaber-PLYWOOD.gcode')
    expect(fileName('???.stl', j)).toBe('part-LightSaber-PLYWOOD.gcode')
  })
  it('xyBounds and shiftXY', () => {
    const l = ['G0 X0 Y0', 'G1 X10 Y5 F600', 'M5', 'G1 Y-2']
    expect(xyBounds(l)).toEqual({ min: { x: 0, y: -2 }, max: { x: 10, y: 5 } })
    expect(shiftXY(l, 100, 50)).toEqual(['G0 X100 Y50', 'G1 X110 Y55 F600', 'M5', 'G1 Y48'])
  })

  const fdmKiri = ['; Generated by Kiri:Moto 4.7.0', '; sliceHeight = 0.2', 'G1 E-0.4 F1800', ';LAYER_CHANGE', ';Z:0.2', 'G1 Z0.2 F4800', 'G1 X300 Y200', 'G1 X310 Y200 E0.5 F1800', ';LAYER_CHANGE', ';Z:0.4', 'G1 Z0.4', 'G1 X300 Y200 E0.5', 'M106 S128', '; --- print time: 120s ---'].join('\n')

  it('FDM: START_JOB with the material, relative E, END_PRINT, header', () => {
    const j = newJob('BlockOne', 'fdm', materialsFor('BlockOne', null).list)
    const f = rhinoFile(fdmKiri, j, part(), M, '0.5.0')
    const lines = f.text.trim().split('\n')
    expect(lines).toContain('; rhino_toolhead = BlockOne')
    expect(lines).toContain('START_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=0')
    expect(lines.indexOf('M83 ; relative extrusion (Kiri:Moto writes E per move)')).toBeGreaterThan(lines.findIndex((l) => l.startsWith('START_JOB')))
    expect(lines.at(-1)).toBe('END_PRINT')
    expect(f.text).not.toContain('sliceHeight = 0.2') // Kiri's settings dump is dropped
    expect(f.text).toContain('; --- print time: 120s ---')
    const { checks } = checkFile(f.text, j, part(), M)
    expect(blocking(checks)).toEqual([])
  })
  it('BlockOne gets the Orca profile\'s CALCULATE_PA line right after START_JOB', () => {
    const j = newJob('BlockOne', 'fdm', materialsFor('BlockOne', null).list)
    const lines = rhinoFile(fdmKiri, j, part(), M, 'x').text.split('\n')
    const i = lines.findIndex((l) => l.startsWith('START_JOB'))
    expect(lines[i + 1]).toBe('CALCULATE_PA BOWDEN_LENGTH=5.9 MATERIAL=PLA LAYER_HEIGHT=0.2 NOZZLE_SIZE=0.4 PRINT_SPEED=60 FILAMENT_DIAMETER=1.75 LINE_WIDTH=0.4')
    expect(blocking(checkFile(lines.join('\n'), j, part(), M).checks)).toEqual([])
  })
  it('SwitchFly gets CALCULATE_PA with its 35 mm bowden (3.5 cm) on either path', () => {
    const list = materialsFor('SwitchFly', null).list
    const sf = newJob('SwitchFly', 'fdm', list)
    expect(paLine(sf)).toMatch(/^CALCULATE_PA BOWDEN_LENGTH=3\.5 MATERIAL=PLA /)
    applyMaterial(sf, list.find((m) => m.key === 'PLA_0_4_T1')!)
    expect(paLine(sf)).toMatch(/^CALCULATE_PA BOWDEN_LENGTH=3\.5 /)
  })
  it('no CALCULATE_PA for a head without a bowden length, or a material the macro does not know', () => {
    const hj = newJob('HotJoe', 'fdm', materialsFor('BlockOne', null).list)
    expect(paLine(hj)).toBeNull()
    const b = newJob('BlockOne', 'fdm', materialsFor('BlockOne', null).list)
    b.material = 'WOODFILL_0_4'
    expect(paLine(b)).toBeNull()
  })
  it('SwitchFly path 1 goes into EXTRUDER=', () => {
    const list = materialsFor('SwitchFly', null).list
    const j = newJob('SwitchFly', 'fdm', list)
    applyMaterial(j, list.find((m) => m.key === 'PLA_0_4_T1')!)
    expect(rhinoFile(fdmKiri, j, part(), M, 'x').text).toContain('START_JOB TOOLHEAD=SwitchFly MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=1')
  })

  const laserKiri = ['G0 X0 Y0', 'M3 S800.000', 'G1 X20 Y0 F600', 'G1 X20 Y10', 'M5'].join('\n')
  it('laser: moved to the placement, passes repeated, rail off and END_PRINT at the end', () => {
    const j = newJob('LightSaber', 'laser', materialsFor('LightSaber', null).list)
    j.placement = { x: 100, y: 50, rotate: 0, scale: 1 }
    j.laser.passes = 2
    const f = rhinoFile(laserKiri, j, part(), M, 'x')
    expect(f.text).toContain('G0 X90 Y45')
    expect(f.text).toContain('G1 X110 Y45 F600')
    expect(f.text.match(/M3 S800/g)).toHaveLength(2)
    expect(f.text).not.toMatch(/^ACTIVATE_LASER/m)
    expect(f.text.trim().split('\n').slice(-3)).toEqual(['M5 ; laser off', 'DEACTIVATE_LASER ; laser power rail off', 'END_PRINT'])
    expect(f.bounds).toEqual({ min: [90, 45, 0], max: [110, 55, 0] })
    const { checks } = checkFile(f.text, j, part(), M)
    expect(blocking(checks)).toEqual([])
    expect(checks.find((c) => c.id === 'laserpower')?.label).toContain('80%')
  })

  it('drag knife: blade plunges at the plunge feed, lifts at the end', () => {
    const j = newJob('DragKnife', 'dragknife', materialsFor('DragKnife', null).list)
    j.placement = { x: 200, y: 100, rotate: 0, scale: 1 }
    const k = ['G0 Z5', 'G0 X0 Y0', 'G0 Z-0.3', 'G1 X10 Y0 F1000', 'G1 X10 Y10', 'G0 Z5'].join('\n')
    const f = rhinoFile(k, j, part(), M, 'x')
    expect(f.text).toContain('G1 Z-0.3 F200')
    expect(f.text).not.toMatch(/^G0 Z-/m)
    const { checks } = checkFile(f.text, j, part(), M)
    expect(blocking(checks)).toEqual([])
  })
})

describe('check', () => {
  const j = () => newJob('BlockOne', 'fdm', materialsFor('BlockOne', null).list)
  const fdm = (body: string[]) =>
    ['; rhino_toolhead = BlockOne', 'START_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=0', 'G90', 'M83', ...body, 'END_PRINT'].join('\n')

  it('a clean file passes', () => {
    expect(blocking(checkFile(fdm(['G1 Z0.2', 'G1 X300 Y200', 'G1 X310 Y200 E1']), j(), part(), M).checks)).toEqual([])
  })
  it.each([
    ['G28', 'commands'],
    ['SET_GCODE_OFFSET Z=1', 'commands'],
    ['SWAP_TOOL TOOL=3', 'commands'],
    ['T1', 'commands'],
    ['G92 X0', 'commands'],
    ['M104 S215', 'heat'],
    ['SET_HEATER_TEMPERATURE HEATER=extruder TARGET=200', 'heat'],
    ['G1 X560 Y200', 'bed'],
    ['G1 X100 Y380', 'bed'],
    ['G1 Z292', 'height'],
    ['G91', 'relative'],
    ['M3 S100', 'commands'],
  ])('blocks %s', (line, id) => {
    const body = ['G1 Z0.2', 'G1 X300 Y200', line, ...(line === 'G91' ? ['G1 X5'] : [])]
    const bad = blocking(checkFile(fdm(body), j(), part(), M).checks).map((c) => c.id)
    expect(bad).toContain(id)
  })
  it('printing over the leadscrew is blocked; travelling over it is not', () => {
    const over = checkFile(fdm(['G1 Z0.2', 'G1 X440 Y320', 'G1 X470 Y320 E1']), j(), part(), M)
    expect(blocking(over.checks).map((c) => c.id)).toContain('keepout')
    const travel = checkFile(fdm(['G1 Z0.2', 'G1 X440 Y320', 'G1 X470 Y320', 'G1 X300 Y200', 'G1 X310 Y200 E1']), j(), part(), M)
    expect(blocking(travel.checks)).toEqual([])
  })
  it('M104 S0 (heater off) is fine', () => {
    expect(blocking(checkFile(fdm(['M104 S0', 'G1 Z0.2', 'G1 X300 Y200 E1']), j(), part(), M).checks)).toEqual([])
  })
  it('START_JOB for another tool is blocked', () => {
    const t = fdm(['G1 Z0.2', 'G1 X300 Y200']).replace('TOOLHEAD=BlockOne', 'TOOLHEAD=SwitchFly')
    expect(blocking(checkFile(t, j(), part(), M).checks).map((c) => c.id)).toContain('start')
  })
  it('no END_PRINT is blocked', () => {
    const t = fdm(['G1 Z0.2', 'G1 X300 Y200']).replace(/END_PRINT$/, 'M107')
    expect(blocking(checkFile(t, j(), part(), M).checks).map((c) => c.id)).toContain('end')
  })
  it('over the prime line is a warning, not a block', () => {
    const r = checkFile(fdm(['G1 Z0.2', 'G1 X6 Y50', 'G1 X20 Y50 E1']), j(), part(), M)
    expect(r.checks.find((c) => c.id === 'prime')?.level).toBe('warn')
    expect(blocking(r.checks)).toEqual([])
  })
  it('laser: power above laser_s_max, Z moves and laser left on are blocked', () => {
    const lj = newJob('LightSaber', 'laser', materialsFor('LightSaber', null).list)
    const t = ['; rhino_toolhead = LightSaber', 'G90', 'G0 X10 Y10', 'G1 Z2', 'M3 S1200', 'G1 X20 Y10 F600', 'END_PRINT'].join('\n')
    const bad = blocking(checkFile(t, lj, part(), M).checks).map((c) => c.id)
    expect(bad).toEqual(expect.arrayContaining(['laserpower', 'laserz', 'laseroff']))
  })
  it('CNC: deeper than the flutes is blocked', () => {
    const cj = newJob('HotJoe', 'cnc', materialsFor('HotJoe', null).list)
    cj.cnc.margin = 5
    cj.cnc.fluteLength = 8
    const t = ['; rhino_toolhead = HotJoe', 'G90', 'G0 Z5', 'G0 X3 Y3', 'G1 Z-10 F200', 'G1 X27 Y3 F1000', 'G0 Z5', 'M5', 'END_PRINT'].join('\n')
    expect(blocking(checkFile(t, cj, part(10), M).checks).map((c) => c.id)).toContain('flute')
  })
  it('CNC: past the stock and below it are blocked; through-cut warns', () => {
    const cj = newJob('HotJoe', 'cnc', materialsFor('HotJoe', null).list)
    cj.cnc.margin = 5 // stock 30 x 30 x 10
    const ok = ['; rhino_toolhead = HotJoe', 'G90', 'G0 Z5', 'G0 X3 Y3', 'G1 Z-10 F200', 'G1 X27 Y3 F1000', 'G0 Z5', 'M5', 'END_PRINT'].join('\n')
    const r = checkFile(ok, cj, part(10), M)
    expect(blocking(r.checks)).toEqual([])
    expect(r.checks.find((c) => c.id === 'through')?.level).toBe('warn')
    const bad = ok.replace('G1 X27 Y3', 'G1 X45 Y3').replace('Z-10', 'Z-12')
    expect(blocking(checkFile(bad, cj, part(10), M).checks).map((c) => c.id)).toEqual(expect.arrayContaining(['stock', 'depth']))
  })
  it('wrong header is blocked', () => {
    const t = fdm(['G1 Z0.2', 'G1 X300 Y200']).replace('rhino_toolhead = BlockOne', 'rhino_toolhead = HotJoe')
    expect(blocking(checkFile(t, j(), part(), M).checks).map((c) => c.id)).toContain('header')
  })
  it('estimates time and filament', () => {
    const { stats } = checkFile(fdm(['G1 Z0.2 F600', 'G1 X300 Y200 F6000', 'G1 X360 Y200 E2 F1800']), j(), part(), M)
    expect(stats.filament).toBe(2)
    expect(stats.workLength).toBeCloseTo(60)
    expect(stats.seconds).toBeGreaterThan(1)
  })
})

describe('model', () => {
  it('merges parts', () => {
    expect(merge([new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])])).toEqual(new Float32Array([1, 2, 3, 4, 5, 6]))
  })
  it('centres on X/Y with the bottom on Z 0, turns and scales', () => {
    const v = transform(cubeVerts(20, 10), 0, 1)
    const i = partInfo('c', v, false)
    expect(i.size).toEqual({ x: 20, y: 20, z: 10 })
    const t = partInfo('c', transform(cubeVerts(20, 10).map((n, k) => (k % 3 === 0 ? n * 2 : n)), 90, 0.5), false)
    expect(t.size.x).toBeCloseTo(10)
    expect(t.size.y).toBeCloseTo(20)
    expect(t.size.z).toBeCloseTo(5)
  })
  it('footprint is the outline seen from above', () => {
    const hull = footprint(transform(cubeVerts(20, 10), 0, 1))
    expect(hull).toHaveLength(4)
    expect(hull).toEqual(expect.arrayContaining([[-10, -10], [10, -10], [10, 10], [-10, 10]]))
  })
})
