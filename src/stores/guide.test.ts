import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGuideStore, type GuideProgress } from './guide'

const p = (o: Partial<GuideProgress> = {}): GuideProgress => ({ phase: 'steps', at: 2, answers: { cause: 'estop' }, ran: ['home'], tried: ['home'], notes: '', waitUntil: 0, waitLabel: '', ...o })

describe('guide progress', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('remembers where you were, per task', () => {
    const g = useGuideStore()
    g.set('t1', p())
    g.set('t2', p({ at: 5 }))
    expect(g.get('t1')!.at).toBe(2)
    expect(g.get('t2')!.at).toBe(5)
    expect(g.get('nope')).toBeNull()
  })
  it('forgets one task without touching another', () => {
    const g = useGuideStore()
    g.set('t1', p())
    g.set('t2', p())
    g.clear('t1')
    expect(g.get('t1')).toBeNull()
    expect(g.get('t2')).not.toBeNull()
  })
  it('keeps a wait’s end time so a countdown can carry on after you come back', () => {
    const g = useGuideStore()
    const end = Date.now() + 45_000
    g.set('t1', p({ waitUntil: end, waitLabel: 'Running at 0.5 throttle' }))
    expect(g.get('t1')!.waitUntil).toBe(end)
  })
})
