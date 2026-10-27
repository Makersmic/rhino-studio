import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PORTAL_BACKUP, PORTAL_PROFILES, PORTAL_CARE_SETUP, PORTAL_CARE_WRITES, PORTAL_HARDWARE, PORTAL_HOOKS, PORTAL_HW_WIZARD, PORTAL_LABELS, PORTAL_NETWORK, PORTAL_SLICER, PORTAL_UPDATE, PORTAL_TRUST, PORTAL_RESTART, PORTAL_TOOL_CHECKS, PORTAL_TOOL_SETUP, PORTAL_TOOL_WRITES, PORTAL_WRITES, PortalClient, WRITE_ROUTES,
} from './client'
import type { TaskDef } from '@/maintenance/types'

type Call = { url: string; init?: RequestInit }

function fakePortal() {
  let token = 'tok-1'
  const calls: Call[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.endsWith('/portal/')) {
      return new Response(`<meta name="rhino-token" content="${token}"><p class="version">v1.4.1</p>`, { status: 200 })
    }
    if (init?.method === 'POST') {
      const sent = (init.headers as Record<string, string>)['X-Rhino-Token']
      if (sent !== token) return new Response(JSON.stringify({ ok: false, error: 'This page is out of date (the portal was restarted).' }), { status: 400 })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    return new Response(JSON.stringify({ ok: true, tasks: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, restartPortal: () => (token = 'tok-2') }
}

afterEach(() => vi.unstubAllGlobals())

describe('PortalClient', () => {
  it('reads the token and version, then logs work with it', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    await c.logWork('t1', { action: 'done', notes: 'ok' })
    expect(c.version).toBe('1.4.1')
    const post = p.calls.find((x) => x.init?.method === 'POST')!
    expect(post.url).toBe('/portal/api/maint/tasks/t1/done')
    expect((post.init!.headers as Record<string, string>)['X-Rhino-Token']).toBe('tok-1')
  })

  it('fetches a new token once if the Portal restarted', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    await c.snooze('t1', 7)
    p.restartPortal()
    await c.snooze('t1', 7)
    const posts = p.calls.filter((x) => x.init?.method === 'POST')
    expect(posts).toHaveLength(3) // ok, refused, retried
    expect(JSON.parse(String(posts[2]!.init!.body))).toEqual({ days: 7 })
  })

  it('clamps snooze days to the Portal limit', async () => {
    const p = fakePortal()
    await new PortalClient('/portal').snooze('t1', 400)
    expect(JSON.parse(String(p.calls.find((x) => x.init?.method === 'POST')!.init!.body))).toEqual({ days: 90 })
  })
  it('reads jobs per week with a plain GET, no token', async () => {
    const p = fakePortal()
    await new PortalClient('/portal').jobsPerWeek()
    expect(p.calls.map((c) => c.url)).toEqual(['/portal/api/dash/jobs'])
    expect(p.calls[0]!.init?.method ?? 'GET').toBe('GET')
  })

  it('pin labels: only the four label routes, and a label in the path is plain letters, digits and _', () => {
    expect([...PORTAL_LABELS]).toEqual(['label-preview', 'label-save', 'label-delete', 'label-use'])
    expect(WRITE_ROUTES['label-delete']!.path.test('/api/pins/label/ENCLOSURE_LIGHT')).toBe(true)
    for (const bad of ['/api/pins/label/../hardware', '/api/pins/label/a%2Fb', '/api/pins/label/']) expect(WRITE_ROUTES['label-delete']!.path.test(bad), bad).toBe(false)
    expect(WRITE_ROUTES['label-use']).toEqual({ method: 'POST', path: /^\/api\/pins\/label\/use$/ })
  })

  it('wizard writes: device and board names are checked in the path, nothing else is reachable', () => {
    expect(WRITE_ROUTES['device-delete']!.path.test('/api/hardware/devices/chamber_fan')).toBe(true)
    expect(WRITE_ROUTES['board-delete']!.path.test('/api/hardware/boards/ebb')).toBe(true)
    for (const bad of ['/api/hardware/devices/../boards/ebb', '/api/hardware/devices/Chamber', '/api/hardware/devices/', '/api/hardware/boards/a%2Fb'])
      expect(WRITE_ROUTES['device-delete']!.path.test(bad) || WRITE_ROUTES['board-delete']!.path.test(bad), bad).toBe(false)
  })

  it('job hooks: a check and a save, each to its one fixed path (hooks went live in Tool Manager 1.9.0)', () => {
    expect([...PORTAL_HOOKS]).toEqual(['hooks-preview', 'hooks-save'])
    expect(WRITE_ROUTES['hooks-preview']).toEqual({ method: 'POST', path: /^\/api\/preview\/hooks$/ })
    expect(WRITE_ROUTES['hooks-save']).toEqual({ method: 'POST', path: /^\/api\/hooks$/ })
    expect(Object.keys(WRITE_ROUTES).filter((k) => /hook/.test(k)).sort()).toEqual(['hooks-preview', 'hooks-save'])
  })

  it('job hooks: the check and the save are actually sent, with the token and the revision', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    const body = { rev: 3, hooks: { machine: { after_start: ['M117 hi'] } } }
    await c.previewHooks(body)
    await c.saveHooks(body)
    const posts = p.calls.filter((x) => x.init?.method === 'POST')
    expect(posts.map((x) => x.url)).toEqual(['/portal/api/preview/hooks', '/portal/api/hooks'])
    expect(posts.every((x) => (x.init?.headers as Record<string, string>)['X-Rhino-Token'] === 'tok-1')).toBe(true)
    expect(JSON.parse(String(posts[1]?.init?.body))).toEqual(body)
  })

  it('every write kind has exactly one route, and the lists cover them all', () => {
    const kinds = [
      ...PORTAL_WRITES, ...PORTAL_TOOL_CHECKS, ...PORTAL_TOOL_WRITES, ...PORTAL_RESTART,
      ...PORTAL_CARE_WRITES, ...PORTAL_CARE_SETUP, ...PORTAL_TOOL_SETUP, ...PORTAL_HARDWARE, ...PORTAL_HOOKS, ...PORTAL_HW_WIZARD, ...PORTAL_LABELS, ...PORTAL_NETWORK, ...PORTAL_SLICER, ...PORTAL_UPDATE, ...PORTAL_TRUST,
      ...PORTAL_BACKUP, ...PORTAL_PROFILES,
    ]
    expect(new Set(kinds).size).toBe(kinds.length)
    expect(Object.keys(WRITE_ROUTES).sort()).toEqual([...kinds].sort())
  })

  it('backups: each write goes to its one fixed request, with the token (INV-A7)', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    await c.backupNow()
    await c.restore('rhino-pi-20261025-120000.zip', 'all', 'pi')
    const posts = p.calls.filter((x) => x.init?.method === 'POST')
    expect(posts.map((x) => x.url)).toEqual(['/portal/api/backup', '/portal/api/restore'])
    expect(posts.every((x) => (x.init?.headers as Record<string, string>)['X-Rhino-Token'] === 'tok-1')).toBe(true)
    expect(JSON.parse(String(posts[1]?.init?.body))).toEqual({ archive: 'rhino-pi-20261025-120000.zip', item: 'all', confirm: 'pi' })
    expect(c.backupUrl('rhino-pi-1.zip')).toBe('/portal/api/backup/file/rhino-pi-1.zip')
  })

  it('slice profiles: ids are p_ plus letters and digits only, and nothing else reaches the routes', () => {
    expect(WRITE_ROUTES['profile-save']!.path.test('/api/slice-profiles/p_8f3k2a')).toBe(true)
    for (const bad of ['/api/slice-profiles/../backup', '/api/slice-profiles/p_a%2Fb', '/api/slice-profiles/builtin:fdm', '/api/slice-profiles/']) {
      expect(WRITE_ROUTES['profile-save']!.path.test(bad), bad).toBe(false)
      expect(WRITE_ROUTES['profile-delete']!.path.test(bad), bad).toBe(false)
    }
    expect(WRITE_ROUTES['job-save']).toEqual({ method: 'POST', path: /^\/api\/prepare-jobs$/ })
  })

  it('slice profile writes go to their fixed requests, with the token and the revision', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    await c.saveProfile('p_abc123', { name: 'PLA', engine: 'kiri', process: 'fdm', toolhead: null, material: null, settings: {}, notes: '' }, 4)
    await c.deleteProfile('p_abc123')
    await c.saveJob('tool/BlockOne', { profileId: 'p_abc123', profileRev: 4, process: 'fdm', engine: 'kiri', toolhead: 'BlockOne', material: 'PLA', overrides: {}, placement: { x: 0, y: 0, rotate: 0, scale: 1 } })
    const writes = p.calls.filter((x) => x.init?.method === 'POST' || x.init?.method === 'DELETE')
    expect(writes.map((x) => `${x.init?.method} ${x.url}`)).toEqual([
      'POST /portal/api/slice-profiles/p_abc123', 'DELETE /portal/api/slice-profiles/p_abc123', 'POST /portal/api/prepare-jobs',
    ])
    expect(JSON.parse(String(writes[0]?.init?.body)).rev).toBe(4)
    expect(writes.every((x) => (x.init?.headers as Record<string, string>)['X-Rhino-Token'] === 'tok-1')).toBe(true)
  })

  it('tool writes go to their fixed requests, with the token', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    await c.checkTool({ name: 'X' })
    await c.preview('control', {})
    await c.preview('macro', {})
    await c.addTool({ name: 'X' })
    await c.editTool('Foam Wire', { notes: '' })
    await c.renameTool('X', 'Y')
    await c.deleteTool('X')
    await c.deletePhoto('X', 'a.jpg')
    await c.restartKlipper()
    await c.setAutoRestart(true)
    const writes = p.calls.filter((x) => x.init?.method === 'POST' || x.init?.method === 'DELETE').map((x) => `${x.init!.method} ${x.url}`)
    expect(writes).toEqual([
      'POST /portal/api/tools/check',
      'POST /portal/api/preview/control',
      'POST /portal/api/preview/macro',
      'POST /portal/api/tools',
      'POST /portal/api/tools/Foam%20Wire/edit',
      'POST /portal/api/tools/X/rename',
      'DELETE /portal/api/tools/X',
      'DELETE /portal/api/tools/X/photos/a.jpg',
      'POST /portal/api/restart',
      'POST /portal/api/restart/auto',
    ])
    for (const x of p.calls.filter((x) => x.init?.method === 'POST' || x.init?.method === 'DELETE'))
      expect((x.init!.headers as Record<string, string>)['X-Rhino-Token']).toBe('tok-1')
  })

  it('a name that would reach another route is refused before anything is sent', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    await expect(c.editTool('X/../../restart', {})).resolves.toBeTruthy() // encoded: stays one path segment
    expect(p.calls.at(-1)!.url).toBe('/portal/api/tools/X%2F..%2F..%2Frestart/edit')
    // and a route Studio never makes is refused outright
    await expect((c as unknown as { write: (k: string, m: string, p: string) => Promise<unknown> }).write('restart', 'POST', '/api/maint/settings')).rejects.toThrow(/doesn't send/)
    await expect((c as unknown as { write: (k: string, m: string, p: string) => Promise<unknown> }).write('nope', 'POST', '/api/restart')).rejects.toThrow(/doesn't send/)
  })

  it('care, setup and hardware writes go to their fixed requests, with the token', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    const def = { title: 'Belts', asset: 'machine:motion_xy' } as TaskDef
    await c.createTask(def)
    await c.updateTask('t1', def)
    await c.updateTask('t1', { detach: true })
    await c.deleteTask('t1')
    await c.setTaskStatus('t1', { status: 's_parts', note: 'belt' })
    await c.taskToLibrary('t1')
    await c.setMeter({ scope: 'machine', meter: 'prod_h', value: 10 })
    await c.careSettings({ boot_reminder: false })
    await c.saveTemplate(null, def)
    await c.saveTemplate('u_1', def)
    await c.deleteTemplate('u_1')
    await c.assignTemplate('u_1', 'tool:BlockOne')
    await c.saveBook(null, { name: 'B', description: '', templates: ['u_1'] })
    await c.saveBook('b_1', { name: 'B', description: '', templates: ['u_1'] })
    await c.deleteBook('b_1')
    await c.assignBook('b_1', 'machine', false)
    await c.saveAreas([{ id: 'frame', label: 'Frame' }])
    await c.saveMaintLists({ priorities: { low: 'Low' } })
    await c.saveStatuses({ builtin: {}, custom: [] })
    await c.saveToolLists({ nozzles: '0.4' })
    await c.previewHardware({ name: 'light' })
    await c.saveHardware({ name: 'light' })
    await c.deleteHardware('light')
    const writes = p.calls.filter((x) => x.init?.method === 'POST' || x.init?.method === 'DELETE').map((x) => `${x.init!.method} ${x.url}`)
    expect(writes).toEqual([
      'POST /portal/api/maint/tasks',
      'POST /portal/api/maint/tasks/t1',
      'POST /portal/api/maint/tasks/t1',
      'DELETE /portal/api/maint/tasks/t1',
      'POST /portal/api/maint/tasks/t1/status',
      'POST /portal/api/maint/tasks/t1/to-library',
      'POST /portal/api/maint/meters',
      'POST /portal/api/maint/settings',
      'POST /portal/api/maint/templates',
      'POST /portal/api/maint/templates/u_1',
      'DELETE /portal/api/maint/templates/u_1',
      'POST /portal/api/maint/templates/u_1/assign',
      'POST /portal/api/maint/books',
      'POST /portal/api/maint/books/b_1',
      'DELETE /portal/api/maint/books/b_1',
      'POST /portal/api/maint/books/b_1/assign',
      'POST /portal/api/maint/areas',
      'POST /portal/api/maint/lists',
      'POST /portal/api/maint/statuses',
      'POST /portal/api/lists',
      'POST /portal/api/preview/hardware',
      'POST /portal/api/hardware',
      'DELETE /portal/api/hardware/light',
    ])
    for (const x of p.calls.filter((x) => x.init?.method === 'POST' || x.init?.method === 'DELETE'))
      expect((x.init!.headers as Record<string, string>)['X-Rhino-Token']).toBe('tok-1')
    const body = (i: number) => JSON.parse(String(p.calls.filter((x) => x.init?.method === 'POST' || x.init?.method === 'DELETE')[i]!.init!.body))
    expect(body(2)).toEqual({ detach: true })
    expect(body(15)).toEqual({ asset: 'machine', on: false })
    expect(body(20)).toEqual({ item: { name: 'light' } })
  })

  it('a care write cannot reach a tool or restart route', async () => {
    fakePortal()
    const w = (new PortalClient('/portal') as unknown as { write: (k: string, m: string, p: string) => Promise<unknown> }).write.bind(new PortalClient('/portal'))
    await expect(w('task-update', 'POST', '/api/restart')).rejects.toThrow(/doesn't send/)
    await expect(w('task-delete', 'DELETE', '/api/tools/BlockOne')).rejects.toThrow(/doesn't send/)
    await expect(w('hardware-delete', 'DELETE', '/api/hardware/a/b')).rejects.toThrow(/doesn't send/)
    await expect(w('tool-lists', 'POST', '/api/maint/lists')).rejects.toThrow(/doesn't send/)
  })

  it('photos go up as a form, not JSON', async () => {
    const p = fakePortal()
    await new PortalClient('/portal').addPhoto('X', new Blob(['x'], { type: 'image/png' }), 'a.png')
    const post = p.calls.find((x) => x.url.endsWith('/photos'))!
    expect(post.init!.body).toBeInstanceOf(FormData)
    expect((post.init!.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('media paths become URLs through the Portal base', () => {
    const c = new PortalClient('/portal/')
    expect(c.media('/media/FoamWire/a.jpg')).toBe('/portal/media/FoamWire/a.jpg')
    expect(c.media('/static/img/tools/blockone-light.png')).toBe('/portal/static/img/tools/blockone-light.png')
    expect(c.media('')).toBeNull()
  })
})
