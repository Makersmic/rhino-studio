/**
 * Fans with a speed signal (Tool Manager 1.9's Add hardware: 3- and 4-wire fans write tachometer_pin).
 *
 * Klipper reports `rpm` on every fan section ([fan], [fan_generic], [heater_fan], [controller_fan],
 * [temperature_fan]); it's null when the fan has no tachometer_pin. Only fans with a reading are shown.
 * A stall is a fan Klipper is driving (30 % or more) whose speed signal reads nothing for STALL_SECONDS:
 * a seized bearing or a broken wire, the kind of fault a machine left alone for months collects.
 */
import type { Status } from '@/moonraker/client'

export const FAN_KINDS = ['fan_generic', 'heater_fan', 'controller_fan', 'temperature_fan'] as const
export const STALL_SECONDS = 10
export const STALL_MIN_SPEED = 0.3
/** Below this a fan with a working signal isn't turning (signal noise reads a few rpm). */
export const STALL_RPM = 60

const KIND_LABEL: Record<string, string> = {
  fan: 'Part fan',
  fan_generic: 'Fan',
  heater_fan: 'Hotend fan',
  controller_fan: 'Driver fan',
  temperature_fan: 'Temperature fan',
}

/** Fan objects to subscribe to, from Klipper's object list. */
export function fanWatch(objects: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const o of objects) {
    if (o === 'fan' || FAN_KINDS.some((k) => o.startsWith(`${k} `))) out[o] = ['speed', 'rpm']
  }
  return out
}

export interface FanReading {
  id: string
  name: string
  kind: string
  label: string
  speed: number
  rpm: number
}

/** Fans that have a speed signal, in name order. */
export function fanReadings(status: Status): FanReading[] {
  const out: FanReading[] = []
  for (const [id, v] of Object.entries(status)) {
    const kind = id === 'fan' ? 'fan' : id.split(' ')[0]!
    if (id !== 'fan' && !(FAN_KINDS as readonly string[]).includes(kind)) continue
    const o = (v ?? {}) as { speed?: number | null; rpm?: number | null }
    if (o.rpm == null) continue
    const name = id === 'fan' ? 'fan' : id.slice(kind.length + 1)
    out.push({ id, name, kind, label: fanTitle(name, kind), speed: o.speed ?? 0, rpm: o.rpm })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Track stalls over time. `since` holds when each fan was first seen not turning while driven;
 * returns the fans stalled for STALL_SECONDS or more, and the new `since` to keep.
 */
export function fanStalls(readings: FanReading[], since: Record<string, number>, now: number): { stalled: FanReading[]; since: Record<string, number> } {
  const next: Record<string, number> = {}
  const stalled: FanReading[] = []
  for (const f of readings) {
    if (f.speed >= STALL_MIN_SPEED && f.rpm < STALL_RPM) {
      next[f.id] = since[f.id] ?? now
      if (now - next[f.id]! >= STALL_SECONDS * 1000) stalled.push(f)
    }
  }
  return { stalled, since: next }
}

export const rpmText = (rpm: number) => String(Math.round(rpm))

/** A fan by its own name: drivers -> "Drivers fan", chamber_exhaust_fan -> "Chamber exhaust fan"; Klipper's [fan] is the part fan. */
export function fanTitle(name: string, kind: string): string {
  if (kind === 'fan') return KIND_LABEL.fan!
  const h = name.replace(/_/g, ' ').trim()
  const cap = h.charAt(0).toUpperCase() + h.slice(1)
  return /\bfan\b/i.test(h) ? cap : `${cap} fan`
}
