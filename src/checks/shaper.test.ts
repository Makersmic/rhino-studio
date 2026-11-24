import { describe, expect, it } from 'vitest'
import { pathFor, parseCsv, boardLines, boardProblem, calibrateScript, fitSentence, gentleScript, noiseSentence, parseCalibrate, parseNoise, parseQuery, querySentence, scriptProblem, shaperLines } from './shaper'

const CAL = [
  'Calculating the best input shaper parameters for y axis',
  "Fitted shaper 'zv' frequency = 59.4 Hz (vibrations = 14.6%, smoothing ~= 0.081)",
  "To avoid too much smoothing with 'zv', suggested max_accel <= 6100 mm/sec^2",
  "Fitted shaper 'mzv' frequency = 47.8 Hz (vibrations = 2.5%, smoothing ~= 0.123)",
  "To avoid too much smoothing with 'mzv', suggested max_accel <= 4500 mm/sec^2",
  'Recommended shaper_type_y = mzv, shaper_freq_y = 47.8 Hz',
  'The SAVE_CONFIG command will update the printer config file',
]
describe('input shaping logic', () => {
  it('query', () => {
    expect(parseQuery(['accelerometer values (x, y, z): 0.2, -0.1, 9.81'])).toEqual({ x: 0.2, y: -0.1, z: 9.81 })
    expect(parseQuery(['nothing'])).toBeNull()
    expect(querySentence({ x: 0.2, y: -0.1, z: 9.81 }).say).toMatch(/flat, as expected/)
    expect(querySentence({ x: 9.7, y: 0, z: 0.5 }).say).toMatch(/axes_map/)
    expect(querySentence({ x: 0, y: 0, z: 0 }).ok).toBe(false)
    expect(querySentence({ x: 30, y: 0, z: 0 }).ok).toBe(false)
  })
  it('noise', () => {
    const n = parseNoise(['Axes noise for xyz-axis accelerometer: 12.300000 (x), 11.100000 (y), 30.000000 (z)'])!
    expect(n).toEqual({ x: 12.3, y: 11.1, z: 30 })
    expect(noiseSentence(n).ok).toBe(true)
    expect(noiseSentence({ x: 400, y: 1, z: 1 }).say).toMatch(/Tighten the mount/)
    expect(parseNoise([])).toBeNull()
  })
  it('SHAPER_CALIBRATE output', () => {
    const r = parseCalibrate(CAL)
    expect(r).toHaveLength(1)
    expect(r[0]!.axis).toBe('y')
    expect(r[0]!.fits.map((f) => f.name)).toEqual(['zv', 'mzv'])
    expect(r[0]!.fits[1]).toEqual({ name: 'mzv', freq: 47.8, vibrations: 2.5, smoothing: 0.123, maxAccel: 4500 })
    expect(r[0]!.recommended).toEqual({ type: 'mzv', freq: 47.8 })
    expect(parseCalibrate([...CAL, ...CAL.map((l) => l.replace(/ y axis/, ' x axis'))]).map((a) => a.axis)).toEqual(['y', 'x'])
    expect(parseCalibrate(['!! Unable to communicate'])).toEqual([])
  })
  it('a fit in words', () => {
    expect(fitSentence({ name: 'mzv', freq: 47.8, vibrations: 2.5, smoothing: 0.123, maxAccel: 4500 })).toBe('47.8 Hz: almost no ringing left, slightly rounded corners; up to 4500 mm/s² before it smooths too much.')
    expect(fitSentence({ name: 'zv', freq: 60, vibrations: 20, smoothing: 0.3, maxAccel: null })).toMatch(/noticeable ringing left, rounded corners\.$/)
  })
  it('scripts', () => {
    expect(gentleScript('x')).toBe('TEST_RESONANCES AXIS=X ACCEL_PER_HZ=25 FREQ_START=20 FREQ_END=50 OUTPUT=raw_data NAME=gentle_x')
    expect(calibrateScript('y')).toBe('SHAPER_CALIBRATE AXIS=Y NAME=rhino_y')
    expect(scriptProblem(calibrateScript('x'))).toBeNull()
    expect(scriptProblem('SHAPER_CALIBRATE AXIS=X\nSAVE_CONFIG')).toMatch(/isn't allowed/)
    expect(scriptProblem('G28')).toMatch(/TEST_RESONANCES/)
  })
  it('board config', () => {
    const b = { serial: '/dev/serial/by-id/usb-Klipper_rp2040_E66058A3-if00', csPin: 'adxl:gpio1', spiBus: 'spi0a', axesMap: 'x,y,z' }
    expect(boardProblem(b)).toBeNull()
    expect(boardProblem({ ...b, serial: '/dev/ttyACM0' })).toMatch(/by-id/)
    expect(boardProblem({ ...b, csPin: 'gpio1' })).toMatch(/adxl:gpio1/)
    expect(boardProblem({ ...b, axesMap: 'x,y' })).toMatch(/axes map/)
    expect(boardLines(b, { x: 150, y: 150, z: 20 })).toContain('probe_points: 150,150,20')
    expect(boardLines(b, { x: 1, y: 2, z: 3 })[0]).toBe('[mcu adxl]')
    expect(shaperLines({ type: 'mzv', freq: 47.8 }, { type: 'ei', freq: 40 })).toEqual(['[input_shaper]', 'shaper_type_x: mzv', 'shaper_freq_x: 47.8', 'shaper_type_y: ei', 'shaper_freq_y: 40'])
  })
  it('reads the calibration csv and makes a path', () => {
    const csv = 'freq,psd_x,psd_y,psd_z,psd_xyz,zv(59.4),mzv(47.8)\n5,1,1,1,3,2,1\n10,2,2,2,6,4,2\n15,4,4,4,12,8,4\nbad,row\n'
    const c = parseCsv(csv)!
    expect(c.freq).toEqual([5, 10, 15])
    expect(c.psd).toEqual([3, 6, 12])
    expect(c.shapers.map((x) => [x.name, x.freq])).toEqual([['zv', 59.4], ['mzv', 47.8]])
    expect(parseCsv('nonsense')).toBeNull()
    expect(pathFor(c.psd, c.freq, 100, 50, 12)).toBe('M0.0 37.5L50.0 25.0L100.0 0.0')
    expect(pathFor([], [], 1, 1, 1)).toBe('')
  })
})
