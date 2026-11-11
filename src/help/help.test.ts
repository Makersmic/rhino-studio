import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { chapterHtml, helpFor, helpRoute, missingTargets, neighbours, parseIndex, searchHelp, snippet, type HelpIndex } from './help'

const ix: HelpIndex = parseIndex({
  version: '1.9.24',
  pdf: 'https://example/manual.pdf',
  parts: [{ title: 'Rhino Studio', chapters: ['control', 'bed'] }],
  chapters: {
    control: { title: 'Control', part: 'Rhino Studio', sections: [{ id: '', title: '', text: 'Control runs the machine: motion, heat and the console.' }] },
    bed: {
      title: 'Bed',
      part: 'Rhino Studio',
      sections: [
        { id: '', title: '', text: 'Bed has two pages.' },
        { id: 'bed-mesh', title: 'Bed mesh', text: 'The page shows the bed from above. Use makes Klipper follow a mesh.' },
        { id: 'configuration-moving-one-lead-screw', title: 'Configuration: moving one lead screw', text: 'Moves one Z screw.' },
      ],
    },
  },
})

describe('help', () => {
  it('finds the chapter for a screen, the longest prefix first', () => {
    expect(helpFor('/bed/config')).toEqual({ chapter: 'bed', section: 'configuration-moving-one-lead-screw' })
    expect(helpFor('/bed')).toEqual({ chapter: 'bed' })
    expect(helpFor('/assets/toolheads/BlockOne/tune')).toEqual({ chapter: 'tuning-a-print-head' })
    expect(helpFor('/assets/toolheads/BlockOne')).toEqual({ chapter: 'assets' })
    const proc = (n: string) => ({ LightSaber: 'laser', DragKnife: 'dragknife', BlockOne: 'print' })[n]
    expect(helpFor('/assets/toolheads/LightSaber/tune', proc)).toEqual({ chapter: 'tuning-a-laser-or-drag-knife' })
    expect(helpFor('/assets/toolheads/DragKnife/tune', proc)).toEqual({ chapter: 'tuning-a-laser-or-drag-knife' })
    expect(helpFor('/assets/toolheads/BlockOne/tune', proc)).toEqual({ chapter: 'tuning-a-print-head' })
    expect(helpFor('/start')).toEqual({ chapter: 'running-a-job', section: 'start-wizard' })
    expect(helpFor('/settingsx')).toBeNull()
    expect(helpFor('/style')).toBeNull()
  })

  it('makes Help routes, the contents when there is no chapter', () => {
    expect(helpRoute(null)).toBe('/settings/help')
    expect(helpRoute({ chapter: 'bed', section: 'bed-mesh' })).toBe('/settings/help/bed/bed-mesh')
  })

  it('names screen targets the index does not have', () => {
    const m = missingTargets(ix)
    expect(m).toContain('files')
    expect(m).not.toContain('bed/configuration-moving-one-lead-screw')
    expect(m).not.toContain('control')
  })

  it('refuses an index that names a missing chapter', () => {
    expect(() => parseIndex({ parts: [{ title: 'x', chapters: ['nope'] }], chapters: {} })).toThrow(/missing chapter/)
    expect(() => parseIndex(null)).toThrow()
  })

  it('refuses chapter HTML that could run, and points pictures into help/', () => {
    expect(() => chapterHtml('<p onclick="x()">a</p>')).toThrow()
    expect(() => chapterHtml('<script>x()</script>')).toThrow()
    expect(() => chapterHtml('<a href="javascript:x()">a</a>')).toThrow()
    expect(chapterHtml('<img src="img/a.webp" alt="">')).toBe('<img src="help/img/a.webp" alt="">')
    expect(chapterHtml('<img src="https://x/a.png">')).toBe('<img src="https://x/a.png">')
  })

  it('searches sections, every word required, titles first', () => {
    const h = searchHelp(ix, 'mesh klipper')
    expect(h[0]).toMatchObject({ chapter: 'bed', section: 'bed-mesh', title: 'Bed mesh', where: 'Bed' })
    expect(searchHelp(ix, 'mesh spindle')).toEqual([])
    expect(searchHelp(ix, 'bed')[0]).toMatchObject({ chapter: 'bed', section: '' }) // the chapter's start
    expect(searchHelp(ix, ' ')).toEqual([])
  })

  it('cuts a snippet around the first word', () => {
    const t = 'a'.repeat(200) + ' target ' + 'b'.repeat(200)
    const s = snippet(t, ['target'])
    expect(s.startsWith('…')).toBe(true)
    expect(s).toContain('target')
    expect(s.length).toBeLessThan(170)
  })

  it('knows the chapter before and after', () => {
    expect(neighbours(ix, 'control')).toEqual({ prev: undefined, next: 'bed' })
    expect(neighbours(ix, 'nope')).toEqual({})
  })
})

// The real manual, when the Tool Manager repo sits next to this one (it does on the dev PC; CI checks the same list
// from its side in dev/test_help.py)
const REAL = new URL('../../../Toolhead_Manager/manual/web/index.json', import.meta.url)
describe.skipIf(!existsSync(REAL))('help against the real manual', () => {
  it('every screen\'s ? lands on a chapter and section that exist', () => {
    const real = parseIndex(JSON.parse(readFileSync(REAL, 'utf8')))
    expect(missingTargets(real)).toEqual([])
  })
})
