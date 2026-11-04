/**
 * The themes that come with Studio. builtinThemes.json holds only each theme's colours, one set per role and look, which
 * keeps it small. Picking one spreads those roles over the panels here. Saving a change makes a copy on the machine, so
 * nothing about a built-in theme ever needs writing back.
 */
import DATA from './builtinThemes.json'
import { SHELL_ID, cleanTheme, type PanelColors, type ThemeMap } from './panelColors'

interface Look {
  page: string
  main: PanelColors
  alt: PanelColors
  hero: PanelColors
}
const THEMES = DATA as unknown as Record<string, { night: Look; day: Look }>

/** The status box on each screen, which holds Pause and Cancel. builtinThemes.test.ts keeps orange off its buttons. */
export const HERO_PANELS = ['control.status', 'dash.status', 'prepare.tool', 'mesh.reading', 'tool.about', 'edit.tool', 'preview.file', 'settings.about', 'wizard.step', 'hwwizard.step', 'hwwizard.done']
/** A second colour, so a screen has some rhythm */
const ALT_PANELS = ['control.console', 'control.macros.system', 'control.macros.tool', 'control.flow', 'control.speed', 'care.worklog', 'dash.glance', 'dash.next', 'dash.jobs', 'dash.jobsweek',
  'edit.macros', 'edit.controls', 'edit.contacts', 'files.config', 'files.logs', 'hooks.scope', 'mesh.make', 'prepare.settings', 'prepare.file', 'settings.appearance', 'settings.cameras',
  'settings.builtwith', 'settings.host.services', 'settings.host.backups', 'settings.logs', 'settings.netpi', 'settings.profiles', 'settings.tools', 'settings.trust.add', 'tool.macros', 'tool.connector']
/** The rest, and any panel not named here, take the main colours from the page's own (SHELL_ID) */
const MAIN_PANELS = ['care.meters', 'control.camera', 'control.hardware', 'control.motion', 'dash.assets', 'dash.hours', 'dash.workweek', 'edit.limits', 'edit.materials', 'edit.photos',
  'files.gcodes', 'files.history', 'mesh.list', 'mesh.map', 'prepare.bed', 'prepare.process', 'settings.host.klipper', 'settings.host.host', 'settings.host.hostname', 'settings.machine',
  'settings.netlink', 'settings.netscreen', 'settings.software', 'settings.trust', 'settings.zipupdate', 'tool.care', 'tool.materials']

export const BUILTIN_NAMES = Object.keys(THEMES).sort((a, b) => a.localeCompare(b))
export const isBuiltin = (name: string) => Object.hasOwn(THEMES, name)

const expanded = new Map<string, ThemeMap>()

/** A built-in theme's colours for every panel, or null if there's no such theme */
export function builtinPanels(name: string): ThemeMap | null {
  if (!isBuiltin(name)) return null
  let out = expanded.get(name)
  if (!out) {
    const t = THEMES[name]!
    const panels: Record<string, unknown> = {}
    const put = (ids: string[], role: 'main' | 'alt' | 'hero') => {
      for (const id of ids) panels[id] = { night: t.night[role], day: t.day[role] }
    }
    put(MAIN_PANELS, 'main')
    put(ALT_PANELS, 'alt')
    put(HERO_PANELS, 'hero')
    panels[SHELL_ID] = { night: { ...t.night.main, page: t.night.page }, day: { ...t.day.main, page: t.day.page } }
    out = cleanTheme(panels)
    expanded.set(name, out)
  }
  return out
}
