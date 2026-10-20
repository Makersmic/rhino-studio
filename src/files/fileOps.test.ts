import { describe, expect, it } from 'vitest'
import {
  backupPath,
  backupsToPrune,
  BACKUPS_KEPT,
  keepBothName,
  lockReason,
  nameProblem,
  openMode,
  restartFor,
  sortEntries,
  uploadProblem,
  EDIT_LIMIT,
  VIEW_LIMIT,
} from './fileOps'

describe('names', () => {
  it('refuses empty, dots, slashes, hidden and padded names', () => {
    for (const n of ['', ' ', '.', '..', '.hidden', 'a/b', 'a\\b', ' lead', 'trail ', 'x\u0001y', 'x'.repeat(201)]) expect(nameProblem(n), n).not.toBeNull()
  })
  it('accepts ordinary names, spaces and brackets included', () => {
    for (const n of ['printer.cfg', 'bracket v2 (final).gcode', 'parts', 'my-macros_1.cfg']) expect(nameProblem(n), n).toBeNull()
  })
  it('keep both: the first free "(n)" before the extension', () => {
    expect(keepBothName('part.gcode', new Set(['part.gcode']))).toBe('part (1).gcode')
    expect(keepBothName('part.gcode', new Set(['part.gcode', 'part (1).gcode']))).toBe('part (2).gcode')
    expect(keepBothName('part (1).gcode', new Set(['part (1).gcode']))).toBe('part (2).gcode')
    expect(keepBothName('Makefile', new Set(['Makefile']))).toBe('Makefile (1)')
  })
})

describe('opening a file', () => {
  it('text under 2 MB edits; bigger views; over 25 MB or binary downloads', () => {
    expect(openMode('config', 'printer.cfg', 1000).mode).toBe('edit')
    expect(openMode('gcodes', 'a.gcode', EDIT_LIMIT + 1).mode).toBe('view')
    expect(openMode('gcodes', 'a.gcode', VIEW_LIMIT + 1).mode).toBe('download')
    expect(openMode('config', 'photo.jpg', 10).mode).toBe('download')
    expect(openMode('gcodes', 'part.3mf', 10).mode).toBe('download')
  })
  it('logs are never editable, rotated logs open too', () => {
    expect(openMode('logs', 'klippy.log', 10).mode).toBe('view')
    expect(openMode('logs', 'klippy.log.2026-10-19', 10).mode).toBe('view')
  })
})

describe('the job’s file is locked', () => {
  it('the file itself and every folder it is in, nothing else', () => {
    expect(lockReason('gcodes/parts/a.gcode', 'parts/a.gcode')).toMatch(/using this file/)
    expect(lockReason('gcodes/parts', 'parts/a.gcode')).toMatch(/in this folder/)
    expect(lockReason('gcodes/parts/b.gcode', 'parts/a.gcode')).toBeNull()
    expect(lockReason('gcodes/part', 'parts/a.gcode')).toBeNull() // a name prefix is not the folder
    expect(lockReason('config/printer.cfg', 'a.gcode')).toBeNull()
    expect(lockReason('gcodes/a.gcode', null)).toBeNull()
  })
})

describe('config backups', () => {
  const when = new Date(2026, 9, 20, 17, 5, 9)
  it('into studio_backups, folders flattened, ending .bak (no [include *.cfg] picks it up)', () => {
    expect(backupPath('config/printer.cfg', when)).toBe('config/studio_backups/printer.cfg.20261020-170509.bak')
    expect(backupPath('config/myrhino/positions.cfg', when)).toBe('config/studio_backups/myrhino__positions.cfg.20261020-170509.bak')
  })
  it('keeps the newest ten of each file, never touches others', () => {
    const mine = Array.from({ length: 13 }, (_, i) => `printer.cfg.202610${String(10 + i)}-120000.bak`)
    const other = ['macros.cfg.20261001-120000.bak', 'printer.cfg.notes', 'printer.cfg.20261001-120000.bak.keep']
    const gone = backupsToPrune([...mine, ...other], 'config/printer.cfg')
    expect(gone).toEqual(mine.slice(0, 13 - BACKUPS_KEPT))
  })
})

describe('applying a saved config file', () => {
  it('never restarts by itself: it names what to offer', () => {
    expect(restartFor('config/printer.cfg')).toEqual({ kind: 'firmware', label: 'Restart Klipper to apply' })
    expect(restartFor('config/myrhino/tools.cfg')?.kind).toBe('firmware')
    expect(restartFor('config/moonraker.conf')).toMatchObject({ kind: 'service', service: 'moonraker' })
    expect(restartFor('config/crowsnest.conf')).toMatchObject({ kind: 'service', service: 'crowsnest' })
    expect(restartFor('config/notes.txt')).toBeNull()
    expect(restartFor('gcodes/a.gcode')).toBeNull()
  })
})

describe('sorting', () => {
  const list = [
    { name: 'b.gcode', dir: false, modified: 3, size: 10 },
    { name: 'A10.gcode', dir: false, modified: 1, size: 30 },
    { name: 'a2.gcode', dir: false, modified: 2, size: 30 },
    { name: 'zfolder', dir: true, modified: 9, size: 0 },
    { name: 'afolder', dir: true, modified: 0, size: 0 },
  ]
  const names = (l: typeof list) => l.map((x) => x.name)
  it('folders first; names in natural order', () => {
    expect(names(sortEntries(list, 'name', false))).toEqual(['afolder', 'zfolder', 'a2.gcode', 'A10.gcode', 'b.gcode'])
    expect(names(sortEntries(list, 'name', true))).toEqual(['zfolder', 'afolder', 'b.gcode', 'A10.gcode', 'a2.gcode'])
  })
  it('newest first, biggest first; ties by name', () => {
    expect(names(sortEntries(list, 'date', true))).toEqual(['zfolder', 'afolder', 'b.gcode', 'a2.gcode', 'A10.gcode'])
    expect(names(sortEntries(list, 'size', true))).toEqual(['afolder', 'zfolder', 'a2.gcode', 'A10.gcode', 'b.gcode'])
  })
})

describe('uploads', () => {
  it('G-code folders take G-code; config takes text; logs take nothing', () => {
    expect(uploadProblem('gcodes', 'a.gcode')).toBeNull()
    expect(uploadProblem('gcodes', 'a.stl')).toMatch(/not G-code/)
    expect(uploadProblem('config', 'macros.cfg')).toBeNull()
    expect(uploadProblem('config', 'photo.png')).toMatch(/not a text file/)
    expect(uploadProblem('logs', 'x.log')).toMatch(/read-only/)
  })
})
