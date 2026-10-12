/**
 * Cameras, as Moonraker stores them.
 *
 * Moonraker keeps one camera list for every front end (Mainsail, Fluidd,
 * and now Rhino Studio), so a camera added in one shows up in the others.
 * Cameras set in moonraker.conf ([webcam name] sections) show too, but can
 * only be edited there.
 *
 * Nothing here can move or power the machine: a camera is a picture.
 */

export type ViewMode = 'mjpeg' | 'snapshot' | 'iframe' | 'video' | 'unsupported'
export type Rotation = 0 | 90 | 180 | 270

export interface Webcam {
  uid: string
  name: string
  service: string
  enabled: boolean
  streamUrl: string
  snapshotUrl: string
  targetFps: number
  flipH: boolean
  flipV: boolean
  rotation: Rotation
  /** "16:9", "4:3" ... */
  aspectRatio: string
  /** 'config' = set in moonraker.conf, read-only here */
  source: 'database' | 'config'
}

/** Stream types Studio can show today, in the order the form lists them. */
export const SERVICES: { id: string; label: string; help: string }[] = [
  { id: 'mjpegstreamer', label: 'MJPEG stream', help: 'Crowsnest / ustreamer / mjpg-streamer. Smooth video; the usual choice.' },
  { id: 'mjpegstreamer-adaptive', label: 'MJPEG snapshots', help: 'Fetches still pictures at the frame rate below. Lighter on the Pi and the Wi-Fi.' },
  { id: 'ipstream', label: 'IP camera (video)', help: 'A camera that serves a video file or stream the browser can play directly.' },
  { id: 'iframe', label: 'Web page', help: 'Shows a camera page from another app inside the panel.' },
]

/** Stream types Moonraker knows that Studio can't show yet. */
const LATER = new Set(['hlsstream', 'webrtc-camerastreamer', 'webrtc-go2rtc', 'webrtc-mediamtx', 'webrtc-janus', 'jmuxer-stream', 'uv4l-mjpeg-raw'])

export function viewMode(service: string): ViewMode {
  switch (service) {
    case 'mjpegstreamer':
    case 'uv4l-mjpeg':
      return 'mjpeg'
    case 'mjpegstreamer-adaptive':
      return 'snapshot'
    case 'iframe':
      return 'iframe'
    case 'ipstream':
      return 'video'
    default:
      return LATER.has(service) ? 'unsupported' : 'mjpeg'
  }
}

export function serviceLabel(service: string): string {
  return SERVICES.find((s) => s.id === service)?.label ?? service
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const clampFps = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(30, Math.max(1, Math.round(n))) : 15
}

/** Moonraker's raw entry -> our shape. Entries without a name are dropped. */
export function normalizeWebcam(raw: unknown): Webcam | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  if (!name) return null
  const rot = Number(r.rotation)
  return {
    uid: str(r.uid) || `name:${name}`,
    name,
    service: str(r.service, 'mjpegstreamer'),
    enabled: r.enabled !== false,
    streamUrl: str(r.stream_url),
    snapshotUrl: str(r.snapshot_url),
    targetFps: clampFps(r.target_fps),
    flipH: r.flip_horizontal === true,
    flipV: r.flip_vertical === true,
    rotation: ([0, 90, 180, 270] as const).includes(rot as Rotation) ? (rot as Rotation) : 0,
    aspectRatio: /^\d+:\d+$/.test(str(r.aspect_ratio)) ? str(r.aspect_ratio) : '16:9',
    source: r.source === 'config' ? 'config' : 'database',
  }
}

export function normalizeWebcams(list: unknown[]): Webcam[] {
  return list.map(normalizeWebcam).filter((w): w is Webcam => w != null)
}

/** CSS aspect-ratio value. A camera turned on its side swaps width and height. */
export function cssAspect(cam: Pick<Webcam, 'aspectRatio' | 'rotation'>): string {
  const [w, h] = cam.aspectRatio.split(':').map(Number) as [number, number]
  return cam.rotation === 90 || cam.rotation === 270 ? `${h} / ${w}` : `${w} / ${h}`
}

/** CSS transform for flips and rotation. */
export function cssTransform(cam: Pick<Webcam, 'flipH' | 'flipV' | 'rotation' | 'aspectRatio'>): string {
  const parts: string[] = []
  if (cam.rotation) {
    parts.push(`rotate(${cam.rotation}deg)`)
    if (cam.rotation === 90 || cam.rotation === 270) {
      // The picture is laid out in the rotated box, so shrink it to fit after turning
      const [w, h] = cam.aspectRatio.split(':').map(Number) as [number, number]
      parts.push(`scale(${(h / w).toFixed(4)})`)
    }
  }
  if (cam.flipH) parts.push('scaleX(-1)')
  if (cam.flipV) parts.push('scaleY(-1)')
  return parts.join(' ') || 'none'
}

/** Which address the viewer loads for a camera. */
export function sourceUrl(cam: Webcam): string {
  return viewMode(cam.service) === 'snapshot' ? cam.snapshotUrl || cam.streamUrl : cam.streamUrl || cam.snapshotUrl
}

/** Adds a cache-busting parameter so each snapshot is fetched fresh. */
export function withStamp(url: string, stamp: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}_rs=${stamp}`
}

// ---- the add/edit form --------------------------------------------------

export interface WebcamForm {
  uid: string | null
  name: string
  service: string
  enabled: boolean
  streamUrl: string
  snapshotUrl: string
  targetFps: number
  flipH: boolean
  flipV: boolean
  rotation: Rotation
  aspectRatio: string
}

export function blankForm(n: number): WebcamForm {
  const path = n <= 1 ? 'webcam' : `webcam${n}`
  return {
    uid: null,
    name: n <= 1 ? 'Bed' : `Camera ${n}`,
    service: 'mjpegstreamer',
    enabled: true,
    streamUrl: `/${path}/?action=stream`,
    snapshotUrl: `/${path}/?action=snapshot`,
    targetFps: 15,
    flipH: false,
    flipV: false,
    rotation: 0,
    aspectRatio: '16:9',
  }
}

export function formFrom(cam: Webcam): WebcamForm {
  const { uid, name, service, enabled, streamUrl, snapshotUrl, targetFps, flipH, flipV, rotation, aspectRatio } = cam
  return { uid, name, service, enabled, streamUrl, snapshotUrl, targetFps, flipH, flipV, rotation, aspectRatio }
}

/** Problems with the form, in plain words. Empty = OK to save. */
export function validateForm(f: WebcamForm, others: Webcam[]): string[] {
  const errors: string[] = []
  const name = f.name.trim()
  if (!name) errors.push('Give the camera a name.')
  else if (others.some((o) => o.uid !== f.uid && o.name.toLowerCase() === name.toLowerCase())) errors.push(`There is already a camera called "${name}".`)
  const mode = viewMode(f.service)
  const need = mode === 'snapshot' ? f.snapshotUrl : f.streamUrl
  if (!need.trim()) errors.push(mode === 'snapshot' ? 'Snapshots need a snapshot address.' : 'Enter the stream address.')
  for (const u of [f.streamUrl, f.snapshotUrl]) {
    const t = u.trim()
    if (t && !/^(https?:\/\/|\/)/i.test(t)) errors.push(`"${t}" should start with / (a path on the Pi) or http://`)
    if (/^\s*javascript:/i.test(t)) errors.push('That address is not allowed.')
  }
  if (!(f.targetFps >= 1 && f.targetFps <= 30)) errors.push('Frame rate must be 1 to 30.')
  if (!/^\d+:\d+$/.test(f.aspectRatio)) errors.push('Shape must look like 16:9.')
  return errors
}

/** The entry Moonraker's server.webcams.post_item expects. */
export function toPostItem(f: WebcamForm): Record<string, unknown> {
  const item: Record<string, unknown> = {
    name: f.name.trim(),
    service: f.service,
    enabled: f.enabled,
    stream_url: f.streamUrl.trim(),
    snapshot_url: f.snapshotUrl.trim(),
    target_fps: Math.round(f.targetFps),
    target_fps_idle: Math.min(5, Math.round(f.targetFps)),
    flip_horizontal: f.flipH,
    flip_vertical: f.flipV,
    rotation: f.rotation,
    aspect_ratio: f.aspectRatio,
    icon: 'mdiWebcam',
    location: 'printer',
  }
  if (f.uid && !f.uid.startsWith('name:')) item.uid = f.uid
  return item
}

/** Next/previous index in a gallery that wraps around. */
export function step(index: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return 0
  return (((index + dir) % count) + count) % count
}
