import { describe, expect, it } from 'vitest'
import { MOVE_EXTRUDE, MOVE_FEED, MOVE_RAPID, parseGcode } from '@/gcode/parse'
import { BUDGET_REDUCED, SHADE_TRAVEL, SHADE_WORK, buildDraw, fileMoveAt, previewNotes, shadeOf, tangentsOf, visibleRange, widthsOf } from './draw'

const print = { hasExtrusion: true, process: null }
const flat = { hasExtrusion: false, process: null }

describe('how strong each move is', () => {
  it('in a print, only extrusion is work', () => {
    expect(shadeOf(print, MOVE_EXTRUDE, 0, 0)).toBe(SHADE_WORK)
    expect(shadeOf(print, MOVE_FEED, 0, 0)).toBe(SHADE_TRAVEL)
    expect(shadeOf(print, MOVE_RAPID, 0, 0)).toBe(SHADE_TRAVEL)
  })

  it('a laser shows its power, and a move with it off is travel', () => {
    const laser = { hasExtrusion: false, process: 'laser' }
    expect(shadeOf(laser, MOVE_FEED, 1000, 1000)).toBe(SHADE_WORK)
    expect(shadeOf(laser, MOVE_FEED, 0, 1000)).toBe(SHADE_TRAVEL)
    const low = shadeOf(laser, MOVE_FEED, 100, 1000)
    expect(low).toBeGreaterThan(SHADE_TRAVEL)
    expect(low).toBeLessThan(SHADE_WORK)
  })

  it('a laser left on during a G0 shows as cutting, never as harmless travel', () => {
    expect(shadeOf({ hasExtrusion: false, process: 'laser' }, MOVE_RAPID, 800, 800)).toBe(SHADE_WORK)
    expect(shadeOf(flat, MOVE_RAPID, 800, 800)).toBe(SHADE_WORK)
  })

  it('a spindle cuts on feed moves, and its rapids stay travel', () => {
    const cnc = { hasExtrusion: false, process: 'cnc' }
    expect(shadeOf(cnc, MOVE_FEED, 12000, 12000)).toBe(SHADE_WORK)
    expect(shadeOf(cnc, MOVE_RAPID, 12000, 12000)).toBe(SHADE_TRAVEL)
  })

  it('with no extrusion or power at all, as in a Studio CNC file, feed moves are the work', () => {
    expect(shadeOf(flat, MOVE_FEED, 0, 0)).toBe(SHADE_WORK)
    expect(shadeOf(flat, MOVE_RAPID, 0, 0)).toBe(SHADE_TRAVEL)
  })
})

/** A print of closed square walls: every layer is connected moves, with one travel between layers */
function bigPrint(layers: number, movesPerLayer: number) {
  const out = ['M83', 'G0 X0 Y0 Z0.2']
  for (let l = 0; l < layers; l++) {
    out.push(';LAYER_CHANGE', `G1 Z${(0.2 + l * 0.2).toFixed(2)}`)
    for (let i = 1; i <= movesPerLayer; i++) out.push(`G1 X${(i % 200) + 10} Y${(i % 97) + 10} E0.01`)
    out.push('G1 X0 Y0')
  }
  return parseGcode(out.join('\n'))
}

describe('simplifying big files', () => {
  it('a file within budget is drawn as it is, sharing its arrays', () => {
    const p = bigPrint(3, 50)
    const d = buildDraw(p, 1000)
    expect(d.segments).toBe(p.segments)
    expect(d.drawnMoves).toBe(p.moveCount)
    expect(d.sourceMove).toBeNull()
    expect(d.shades.length).toBe(p.moveCount * 2)
  })

  it('stays within budget and keeps every layer', () => {
    const p = bigPrint(40, 2000)
    const d = buildDraw(p, 5000)
    expect(d.drawnMoves).toBeLessThanOrEqual(5000)
    expect(d.drawnMoves).toBeGreaterThan(1000)
    expect(d.layerStarts.length).toBe(p.layerStarts.length)
    expect([...d.layerZ]).toEqual([...p.layerZ])
    for (let i = 1; i < d.layerStarts.length; i++) expect(d.layerStarts[i]!).toBeGreaterThan(d.layerStarts[i - 1]!)
  })

  it('keeps lines joined: each merged line ends where the file\'s run did', () => {
    const p = bigPrint(5, 3000)
    const d = buildDraw(p, 2000)
    let breaks = 0
    for (let i = 1; i < d.drawnMoves; i++) {
      const joined = d.segments[i * 6] === d.segments[i * 6 - 3] && d.segments[i * 6 + 1] === d.segments[i * 6 - 2]
      if (!joined) breaks++
    }
    expect(breaks).toBe(0)
  })

  it('never merges work into travel', () => {
    const p = bigPrint(5, 3000)
    const d = buildDraw(p, 2000)
    let travelSum = 0
    for (let i = 0; i < d.drawnMoves; i++) if (d.shades[i * 2] === SHADE_TRAVEL) travelSum++
    // one travel back to the start per layer, and possibly the Z move before it
    expect(travelSum).toBeGreaterThanOrEqual(5)
    expect(travelSum).toBeLessThanOrEqual(10 + 5)
  })

  it('maps a drawn line back to the file\'s own move', () => {
    const p = bigPrint(5, 3000)
    const d = buildDraw(p, 2000)
    expect(fileMoveAt(d, 0)).toBe(0)
    expect(fileMoveAt(d, d.drawnMoves - 1)).toBeLessThan(p.moveCount)
    expect(fileMoveAt(d, d.drawnMoves >> 1)).toBeGreaterThan(1000)
    expect(fileMoveAt(buildDraw(p, p.moveCount), 77)).toBe(77)
  })

  it('still fits a file that can\'t merge much, and the lighter budget is a real one', () => {
    // Every move is apart from the last: nothing can join, so a run stays one move long
    const out = ['M83', 'G0 X0 Y0 Z0.2']
    for (let i = 0; i < 3000; i++) out.push(`G0 X${i % 50} Y${i % 40}`, `G1 X${(i % 50) + 1} E0.1`)
    const p = parseGcode(out.join('\n'))
    const d = buildDraw(p, 1000)
    expect(d.drawnMoves).toBeGreaterThan(0)
    expect(BUDGET_REDUCED).toBeLessThan(1_500_000)
  })
})

describe('how moves catch the light', () => {
  it('stores each move\'s direction at both of its ends', () => {
    const t = tangentsOf(Float32Array.of(0, 0, 0, 5, 0, 0, 5, 0, 0, 5, 0, -3), 2)
    expect([...t]).toEqual([127, 0, 0, 127, 0, 0, 0, 0, -127, 0, 0, -127])
  })

  it('a diagonal is scaled, and a move of no length stays at zero', () => {
    const [x, y] = tangentsOf(Float32Array.of(0, 0, 0, 1, 1, 0), 1)
    expect(x).toBe(90)
    expect(y).toBe(90)
    expect([...tangentsOf(Float32Array.of(2, 2, 2, 2, 2, 2), 1)]).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('every drawing has a direction for every vertex, simplified or not', () => {
    const p = bigPrint(5, 3000)
    expect(buildDraw(p, p.moveCount).tangents.length).toBe(p.moveCount * 6)
    const small = buildDraw(p, 2000)
    expect(small.tangents.length).toBe(small.drawnMoves * 6)
  })
})

describe('thread width', () => {
  it('uses the slicer\'s width, and the nozzle for moves it doesn\'t cover', () => {
    const p = parseGcode('M83\n; nozzle_diameter = 0.6\nG0 X0 Y0\nG1 X1 E1\n;WIDTH:0.48\nG1 X2 E1')
    expect([...widthsOf(p).widths]).toEqual([60, 48])
    expect(widthsOf(p).assumed).toBe(false)
  })

  it('assumes 0.4 only when the file says neither, and says so', () => {
    const p = parseGcode('M83\nG0 X0 Y0\nG1 X1 E1')
    expect([...widthsOf(p).widths]).toEqual([40])
    expect(buildDraw(p, 10).widthAssumed).toBe(true)
    expect(previewNotes(p, buildDraw(p, 10)).join()).toMatch(/doesn't say its line width/)
  })

  it('a file with widths on every move assumes nothing, even with no nozzle line', () => {
    expect(widthsOf(parseGcode('M83\nG0 X0 Y0\n;WIDTH:0.5\nG1 X1 E1')).assumed).toBe(false)
  })

  it('travel, laser and CNC stay thin lines: a file doesn\'t say how wide a cut is', () => {
    expect([...widthsOf(parseGcode('M83\n; nozzle_diameter = 0.4\nG0 X0 Y0\nG1 X1\nG0 X5')).widths]).toEqual([0, 0])
    expect([...widthsOf(parseGcode('G0 X0 Y0\nM3 S5\nG1 X1\nM5')).widths]).toEqual([0])
    expect(widthsOf(parseGcode('G0 X0 Y0\nM3 S5\nG1 X1\nM5')).assumed).toBe(false)
  })

  it('a simplified drawing keeps one width per drawn line', () => {
    const d = buildDraw(bigPrint(5, 3000), 2000)
    expect(d.widths.length).toBe(d.drawnMoves)
    expect(Math.max(...d.widths)).toBe(40)
  })
})

describe('what shows', () => {
  const d = { layerStarts: Uint32Array.of(0, 10, 30), drawnMoves: 50 }

  it('a layer shows everything up to its end, and dims what came before', () => {
    expect(visibleRange(d, 1)).toEqual({ end: 30, dimBefore: 10 })
    expect(visibleRange(d, 2)).toEqual({ end: 50, dimBefore: 30 })
    expect(visibleRange(d, 0)).toEqual({ end: 10, dimBefore: 0 })
  })

  it('the scrubber goes through a layer', () => {
    expect(visibleRange(d, 1, 0.5)).toEqual({ end: 20, dimBefore: 10 })
    expect(visibleRange(d, 1, 0)).toEqual({ end: 10, dimBefore: 10 })
  })

  it('a layer out of range is held to the ends, and the first layer includes moves before its marker', () => {
    expect(visibleRange(d, 99).end).toBe(50)
    expect(visibleRange(d, -1).end).toBe(10)
    expect(visibleRange({ layerStarts: Uint32Array.of(5, 9), drawnMoves: 20 }, 0)).toEqual({ end: 9, dimBefore: 0 })
  })

  it('no layers at all shows everything', () => {
    expect(visibleRange({ layerStarts: new Uint32Array(0), drawnMoves: 7 }, 0)).toEqual({ end: 7, dimBefore: 0 })
  })
})

describe('notes', () => {
  const stats = (o: Partial<{ skipped: number; straightArcs: number; ignoredPower: number }>) => ({ stats: { bytes: 0, lines: 0, skipped: 0, ignoredPower: 0, straightArcs: 0, ...o } })
  const whole = { drawnMoves: 5, fileMoves: 5, widthAssumed: false }

  it('a plain file has none', () => {
    expect(previewNotes(stats({}), whole)).toEqual([])
  })

  it('says when the drawing is simplified, and that the file isn\'t', () => {
    expect(previewNotes(stats({}), { drawnMoves: 5, fileMoves: 9, widthAssumed: false })[0]).toMatch(/simplified.*isn't changed/)
  })

  it('says macros aren\'t run, and names the other limits', () => {
    expect(previewNotes(stats({ skipped: 3 }), whole)[0]).toMatch(/macros/)
    expect(previewNotes(stats({ straightArcs: 2 }), whole)[0]).toMatch(/straight/)
    expect(previewNotes(stats({ ignoredPower: 2 }), whole)[0]).toMatch(/Klipper ignores S/)
  })
})

describe('support flags (Preview colours supports apart)', () => {
  const g = ['M83', ';LAYER_CHANGE', ';Z:0.2', 'G1 Z0.2', ';TYPE:External perimeter', 'G1 X10 Y0 E1', 'G1 X20 Y0 E1', ';TYPE:Support material', 'G1 X20 Y10 E1', 'G1 X20 Y20 E1', ';TYPE:Perimeter', 'G1 X10 Y20 E1'].join('\n')
  it('marks support moves, and only those', () => {
    const p = parseGcode(g)
    const d = buildDraw(p, 1_000_000)
    const per = Array.from({ length: d.drawnMoves }, (_, i) => d.support[i * 2])
    expect(per.filter((v) => v === 255).length).toBe(2)
    expect(per.at(-1)).toBe(0)
  })
  it('never merges a support move into a model one when moves are joined to fit the budget', () => {
    const p = parseGcode(g)
    const d = buildDraw(p, 2)
    const sup = Array.from({ length: d.drawnMoves }, (_, i) => d.support[i * 2])
    expect(sup).toContain(255)
    expect(sup).toContain(0)
  })
})
