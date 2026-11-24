import { describe, expect, it } from 'vitest'
import { changedLines, fmt, limitProblems, parseEdited, parsePositions, replaceVariables, sentence, testScript, type Limits } from './positions'
import { readFileSync } from 'node:fs'

const FILE = `# header
[gcode_macro RHINO_POSITIONS]
# Park - where the head waits
variable_park_x: 551.0
variable_park_y: 381.0   # keep it clear of the frame
variable_swap_x: 100.0
variable_swap_y: 100.0
variable_safe_z: 150.0
variable_zero_max_z: 290.0
variable_prime_x: 5.0
variable_prime_y: 10.0
variable_prime_length: 120.0
gcode:
  RESPOND MSG="x"
`
const LIM: Limits = { min: [0, 0, -10], max: [576, 406, 295] }

describe('reading and changing the file', () => {
  it('reads the numbers', () => {
    expect(parsePositions(FILE)).toEqual({ park_x: 551, park_y: 381, swap_x: 100, swap_y: 100, safe_z: 150, zero_max_z: 290, prime_x: 5, prime_y: 10, prime_length: 120 })
  })
  it('changes only the named lines and keeps everything else byte for byte, comments included', () => {
    const r = replaceVariables(FILE, { park_x: 560, park_y: 390.5 })
    expect(r.missing).toEqual([])
    expect(r.text).toBe(FILE.replace('variable_park_x: 551.0', 'variable_park_x: 560.0').replace('variable_park_y: 381.0   # keep', 'variable_park_y: 390.5   # keep'))
    expect(r.text.split('\n')).toHaveLength(FILE.split('\n').length)
  })
  it('adds nothing and says so when a line is missing', () => {
    const r = replaceVariables('variable_park_x: 1.0\n', { park_x: 2, swap_x: 3 })
    expect(r.missing).toEqual(['swap_x'])
    expect(r.text).toBe('variable_park_x: 2.0\n')
  })
  it('keeps Windows line endings', () => {
    expect(replaceVariables('variable_park_x: 1.0\r\nx\r\n', { park_x: 5 }).text).toBe('variable_park_x: 5.0\r\nx\r\n')
  })
  it('works on the real shipped file, changing exactly the lines asked for', () => {
    const real = readFileSync('../Toolhead_Manager/myrhino/positions.cfg', 'utf8')
    const before = parsePositions(real)
    expect(Object.keys(before).sort()).toEqual(['park_x', 'park_y', 'prime_length', 'prime_x', 'prime_y', 'safe_z', 'swap_x', 'swap_y', 'zero_max_z'])
    const r = replaceVariables(real, { park_x: before.park_x! + 1, prime_length: 100 })
    const a = real.split('\n')
    const b = r.text.split('\n')
    expect(b).toHaveLength(a.length)
    expect(b.map((l, i) => (l === a[i] ? null : i)).filter((i) => i != null)).toHaveLength(2)
    expect(parsePositions(r.text)).toMatchObject({ park_x: before.park_x! + 1, prime_length: 100, park_y: before.park_y })
  })
})

describe('the travel limits', () => {
  it('passes values inside and names those outside', () => {
    expect(limitProblems({ park_x: 551, park_y: 381 }, LIM)).toEqual([])
    expect(limitProblems({ park_x: 600 }, LIM)[0]).toMatch(/Park X 600.0 is outside X 0 to 576/)
    expect(limitProblems({ safe_z: -20 }, LIM)[0]).toMatch(/Safe height/)
    expect(limitProblems({ prime_y: 10, prime_length: 500 }, LIM).join(' ')).toMatch(/past Y 406/)
    expect(limitProblems({ prime_y: 10, prime_length: 0 }, LIM).join(' ')).toMatch(/more than 0/)
    expect(limitProblems({ nonsense: 1 }, LIM)[0]).toMatch(/isn't one of the positions/)
    expect(limitProblems({ park_x: NaN }, LIM)[0]).toMatch(/isn't a number/)
  })
  it('cannot check without limits, but still refuses non-numbers', () => {
    expect(limitProblems({ park_x: 9999 }, null)).toEqual([])
    expect(limitProblems({ park_x: NaN }, null)).toHaveLength(1)
  })
})

describe('the edit box', () => {
  it('shows the changed lines and reads them back', () => {
    const t = changedLines({ park_y: 390, park_x: 560 })
    expect(t).toBe('variable_park_x: 560.0\nvariable_park_y: 390.0')
    expect(parseEdited(t)).toEqual({ values: { park_x: 560, park_y: 390 }, problem: null })
  })
  it('refuses anything that is not a position number', () => {
    expect(parseEdited('variable_park_x: 5\nG28').problem).toMatch(/isn't a line like/)
    expect(parseEdited('variable_secret: 5').problem).toMatch(/isn't one of the positions/)
    expect(parseEdited('variable_park_x: abc').problem).toMatch(/isn't a line like/)
    expect(parseEdited('# only a note\n\n')).toEqual({ values: {}, problem: null })
  })
})

describe('sentences and the test move', () => {
  it('says what will be different', () => {
    expect(sentence('park', { park_x: 551, park_y: 381 }, { park_x: 560, park_y: 390 })).toBe('After a pause or cancel the head will wait at X560.0 Y390.0 (was X551.0 Y381.0).')
    expect(sentence('safe_z', { safe_z: 150 }, { safe_z: 160 })).toMatch(/Z160.0.*was Z150.0/)
    expect(sentence('prime', { prime_x: 5, prime_y: 10, prime_length: 120 }, { prime_x: 6, prime_y: 10, prime_length: 100 })).toMatch(/run 100.0 mm/)
  })
  it('lifts first, then goes slowly, and puts the move state back', () => {
    const s = testScript('park', { park_x: 560, park_y: 390 }).split('\n')
    expect(s[0]).toBe('SET_GCODE_VARIABLE MACRO=RHINO_POSITIONS VARIABLE=park_x VALUE=560.0')
    expect(s.indexOf('G1 Z10 F600')).toBeLessThan(s.indexOf('G1 X560.0 Y390.0 F2400'))
    expect(s[s.length - 1]).toBe('RESTORE_GCODE_STATE NAME=_rs_pos_test')
    expect(testScript('swap', { swap_x: 1 })).toBe('')
  })
  it('formats numbers plainly', () => {
    expect(fmt(5)).toBe('5.0')
    expect(fmt(5.123)).toBe('5.12')
  })
})
