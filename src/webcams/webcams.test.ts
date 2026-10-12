import { describe, expect, it } from 'vitest'
import { blankForm, cssAspect, cssTransform, formFrom, normalizeWebcam, normalizeWebcams, sourceUrl, step, toPostItem, validateForm, viewMode, withStamp } from './webcams'

const raw = {
  name: 'Bed',
  uid: 'abc',
  service: 'mjpegstreamer-adaptive',
  enabled: true,
  stream_url: '/webcam/?action=stream',
  snapshot_url: '/webcam/?action=snapshot',
  target_fps: 15,
  flip_horizontal: true,
  rotation: 90,
  aspect_ratio: '4:3',
  source: 'database',
}

describe('cameras', () => {
  it('reads Moonraker entries and drops unnamed ones', () => {
    const cam = normalizeWebcam(raw)!
    expect(cam).toMatchObject({ uid: 'abc', name: 'Bed', flipH: true, flipV: false, rotation: 90, aspectRatio: '4:3', source: 'database' })
    expect(normalizeWebcams([raw, { name: '' }, null, 'x'])).toHaveLength(1)
    expect(normalizeWebcam({ name: 'Conf', rotation: 45, target_fps: 999, source: 'config' })).toMatchObject({ rotation: 0, targetFps: 30, uid: 'name:Conf', source: 'config' })
  })

  it('picks a viewer per stream type, and says which ones come later', () => {
    expect(viewMode('mjpegstreamer')).toBe('mjpeg')
    expect(viewMode('mjpegstreamer-adaptive')).toBe('snapshot')
    expect(viewMode('iframe')).toBe('iframe')
    expect(viewMode('ipstream')).toBe('video')
    expect(viewMode('webrtc-camerastreamer')).toBe('unsupported')
    expect(viewMode('hlsstream')).toBe('unsupported')
  })

  it('snapshots load the snapshot address, streams the stream address', () => {
    const cam = normalizeWebcam(raw)!
    expect(sourceUrl(cam)).toBe('/webcam/?action=snapshot')
    expect(sourceUrl({ ...cam, service: 'mjpegstreamer' })).toBe('/webcam/?action=stream')
    expect(withStamp('/webcam/?action=snapshot', 7)).toBe('/webcam/?action=snapshot&_rs=7')
    expect(withStamp('/snap.jpg', 7)).toBe('/snap.jpg?_rs=7')
  })

  it('turns and flips the picture', () => {
    expect(cssTransform({ flipH: false, flipV: false, rotation: 0, aspectRatio: '16:9' })).toBe('none')
    expect(cssTransform({ flipH: true, flipV: true, rotation: 180, aspectRatio: '16:9' })).toBe('rotate(180deg) scaleX(-1) scaleY(-1)')
    expect(cssTransform({ flipH: false, flipV: false, rotation: 90, aspectRatio: '16:9' })).toBe('rotate(90deg) scale(0.5625)')
    expect(cssAspect({ aspectRatio: '16:9', rotation: 90 })).toBe('9 / 16')
    expect(cssAspect({ aspectRatio: '4:3', rotation: 0 })).toBe('4 / 3')
  })

  it('checks the form before saving', () => {
    const others = normalizeWebcams([raw])
    expect(validateForm(blankForm(2), others)).toEqual([])
    expect(validateForm({ ...blankForm(2), name: 'bed' }, others)[0]).toMatch(/already a camera/)
    expect(validateForm({ ...formFrom(others[0]!) }, others)).toEqual([]) // editing itself is fine
    expect(validateForm({ ...blankForm(2), streamUrl: '' }, others)).toContain('Enter the stream address.')
    expect(validateForm({ ...blankForm(2), streamUrl: 'javascript:alert(1)' }, others).join(' ')).toMatch(/not allowed/)
    expect(validateForm({ ...blankForm(2), targetFps: 0 }, others).join(' ')).toMatch(/1 to 30/)
  })

  it('writes the entry Moonraker expects; config cameras never send a fake uid', () => {
    const item = toPostItem({ ...blankForm(1), uid: 'abc' })
    expect(item).toMatchObject({ name: 'Bed', service: 'mjpegstreamer', stream_url: '/webcam/?action=stream', uid: 'abc', rotation: 0 })
    expect(toPostItem({ ...blankForm(1), uid: 'name:Bed' }).uid).toBeUndefined()
    expect(toPostItem(blankForm(1)).uid).toBeUndefined()
  })

  it('gallery arrows wrap around', () => {
    expect(step(0, 3, 1)).toBe(1)
    expect(step(2, 3, 1)).toBe(0)
    expect(step(0, 3, -1)).toBe(2)
    expect(step(0, 0, 1)).toBe(0)
  })
})
