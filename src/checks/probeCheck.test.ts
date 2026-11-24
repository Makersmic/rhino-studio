import { describe, expect, it } from 'vitest'
import { centreSpot, driftSentence, parseProbeAccuracy, problem, rate, script, sentence, warmProblem } from './probeCheck'

const LINE = 'probe accuracy results: maximum 2.519448, minimum 2.506948, range 0.012500, average 2.512875, median 2.512198, standard deviation 0.003836'
describe('probe check', () => {
  it('reads Klipper\'s result line', () => {
    const r = parseProbeAccuracy(['ok', LINE])!
    expect(r.range).toBeCloseTo(0.0125, 6)
    expect(r.average).toBeCloseTo(2.512875, 6)
    expect(r.sd).toBeCloseTo(0.003836, 6)
    expect(parseProbeAccuracy(['!! Probe triggered prior to movement'])).toBeNull()
    expect(parseProbeAccuracy([])).toBeNull()
  })
  it('rates by range', () => {
    expect(rate(0.01)).toBe('excellent')
    expect(rate(0.0125)).toBe('good')
    expect(rate(0.03)).toBe('fair')
    expect(rate(0.2)).toBe('poor')
  })
  it('says it in words', () => {
    expect(sentence(parseProbeAccuracy([LINE])!)).toMatch(/steady enough/)
    expect(sentence({ max: 1, min: 0.9, range: 0.1, average: 0.95, median: 0.95, sd: 0.03 })).toMatch(/Don't trust a bed mesh/)
  })
  it('drift', () => {
    const a = parseProbeAccuracy([LINE])!
    expect(driftSentence(a, { ...a, average: a.average + 0.005 }, 60)).toMatch(/no real drift/)
    expect(driftSentence(a, { ...a, average: a.average - 0.08 }, 60)).toMatch(/thermal drift.*lower|lower.*thermal drift/s)
  })
  it('the spot puts the probe over the middle', () => {
    expect(centreSpot({ min: [0, 0], max: [300, 200] }, 20, 5)).toEqual({ x: 130, y: 95 })
    expect(centreSpot(null, 0, 0)).toBeNull()
    expect(problem(400, 10, { min: [0, 0], max: [300, 200] })).toMatch(/outside/)
    expect(problem(10, 10, { min: [0, 0], max: [300, 200] })).toBeNull()
    expect(problem(NaN, 1, null)).toMatch(/numbers/)
  })
  it('bed temperature and the script', () => {
    expect(warmProblem(60)).toBeNull()
    expect(warmProblem(200)).toMatch(/30 to 130/)
    expect(script(130, 95)).toBe('G90\nG1 X130 Y95 F6000\nPROBE_ACCURACY SAMPLES=10')
  })
})
