/**
 * The camera's microphone (Mike, Nov 9): sound only, from go2rtc on the Rhino (Tool Manager docs/install-mic.md),
 * played on the Dashboard with mute and volume. The picture stays on MJPEG, so if the sound service stops the
 * cameras don't. Look-only: nothing here can reach the machine.
 *
 * go2rtc's WHEP endpoint takes the browser's SDP offer and answers with its own (POST, Content-Type
 * application/sdp). The Rhino's nginx sends exactly one fixed stream there (/mic/webrtc -> /api/webrtc?src=mic),
 * so this page can't ask go2rtc for anything else.
 */

/** Where the Rhino's nginx takes the offer (Studio's own site) */
export const MIC_PATH = '/mic/webrtc'

/** Shared by every screen (Moonraker's database, 'rhino_studio'): is the sound offered on the Dashboard? */
export interface MicSetting {
  on: boolean
}
export const MIC_KEY = 'mic'

export function micSettingOf(v: unknown): MicSetting {
  return { on: !!(v && typeof v === 'object' && (v as Partial<MicSetting>).on === true) }
}

/** This browser's volume, 0-100; a bad saved value goes back to 60 */
export function volumeOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 100) : 60
}

/** Why the sound didn't start, in words */
export function micError(status: number | null, text = ''): string {
  if (status === null) return `The Rhino didn't answer${text ? ` (${text})` : ''}.`
  if (status === 404 || status === 502 || status === 503 || status === 504)
    return "The microphone service isn't running on the Rhino. Tool Manager 1.9.21 and later set it up when a USB camera with a microphone is plugged in (docs/install-mic.md)."
  if (status === 403) return "This screen's address isn't allowed to listen (home network only)."
  return `The microphone service answered ${status}${text ? `: ${text.slice(0, 120)}` : ''}.`
}

type PcLike = Pick<RTCPeerConnection, 'addTransceiver' | 'createOffer' | 'setLocalDescription' | 'setRemoteDescription' | 'close' | 'addEventListener'> & {
  localDescription: RTCSessionDescription | null
  iceGatheringState: RTCIceGatheringState
}

/** Wait for the browser to list its addresses (go2rtc's WHEP takes one offer, no trickle), at most `ms` */
function gathered(pc: PcLike, ms: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((done) => {
    const t = setTimeout(done, ms)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t)
        done()
      }
    })
  })
}

export interface Listening {
  stream: MediaStream
  close: () => void
}

/**
 * Ask for the sound: receive-only audio, one offer and one answer. Throws an Error with words for the screen.
 * `deps` lets the tests stand in for the browser.
 */
export async function listen(
  url: string,
  deps: { makePc?: () => PcLike; fetchFn?: typeof fetch; gatherMs?: number } = {},
): Promise<Listening> {
  const pc = deps.makePc ? deps.makePc() : (new RTCPeerConnection({ iceServers: [] }) as PcLike)
  const fetchFn = deps.fetchFn ?? fetch
  const stream = new MediaStream()
  try {
    const tr = pc.addTransceiver('audio', { direction: 'recvonly' })
    stream.addTrack(tr.receiver.track)
    await pc.setLocalDescription(await pc.createOffer())
    await gathered(pc, deps.gatherMs ?? 2000)
    let r: Response
    try {
      r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription?.sdp ?? '' })
    } catch (e) {
      throw new Error(micError(null, (e as Error).message))
    }
    const text = await r.text()
    if (!r.ok) throw new Error(micError(r.status, text))
    if (!text.startsWith('v=')) throw new Error(micError(r.status, 'not a WebRTC answer'))
    await pc.setRemoteDescription({ type: 'answer', sdp: text })
  } catch (e) {
    pc.close()
    throw e
  }
  return { stream, close: () => pc.close() }
}
