/**
 * Help (Settings › Help, and the "?" in the top bar): the Rhino manual as web pages.
 *
 * The pages come from the Tool Manager's manual (manual/web.py), copied into this site as help/ by the release
 * (dev/make_zip.sh), so Help is on the Rhino itself and works with no internet. Plan: Tool Manager
 * docs/phase-help.md. Help only reads and links: it never runs a command.
 */

export const HELP_BASE = 'help/'

export interface HelpSection { id: string; title: string; text: string }
export interface HelpChapter { title: string; part: string; sections: HelpSection[] }
export interface HelpIndex {
  version: string
  pdf: string
  parts: { title: string; chapters: string[] }[]
  chapters: Record<string, HelpChapter>
}

export interface HelpTarget { chapter: string; section?: string }

/** Which chapter (and section) answers "what is this screen?". Longest matching prefix wins. */
export const HELP_FOR: [prefix: string, target: HelpTarget][] = [
  ['/dashboard', { chapter: 'rhino-studio-at-a-glance' }],
  ['/setup', { chapter: 'job-setup-and-preview' }],
  ['/preview', { chapter: 'job-setup-and-preview' }],
  ['/control', { chapter: 'control' }],
  ['/pendant', { chapter: 'control' }],
  ['/bed/mesh', { chapter: 'bed', section: 'bed-mesh' }],
  ['/bed/config', { chapter: 'bed', section: 'configuration-moving-one-lead-screw' }],
  ['/bed', { chapter: 'bed' }],
  ['/files', { chapter: 'files' }],
  ['/assets', { chapter: 'assets' }],
  ['/care', { chapter: 'care' }],
  ['/settings', { chapter: 'settings' }],
]

/**
 * The Help page for a Studio route. A Tune page goes to tuning: the laser and knife chapter when processOf (the tool's
 * process by name, from Job setup's tool list) says it's one, else the print head's. Unknown screens open the contents.
 */
export function helpFor(path: string, processOf?: (tool: string) => string | undefined): HelpTarget | null {
  const tune = /^\/assets\/toolheads\/([^/]+)\/tune/.exec(path)
  if (tune) {
    const p = processOf?.(decodeURIComponent(tune[1]!))
    return { chapter: p === 'laser' || p === 'dragknife' ? 'tuning-a-laser-or-drag-knife' : 'tuning-a-print-head' }
  }
  let best: [string, HelpTarget] | null = null
  for (const e of HELP_FOR) {
    if ((path === e[0] || path.startsWith(e[0] + '/')) && (!best || e[0].length > best[0].length)) best = e
  }
  return best ? best[1] : null
}

export function helpRoute(t: HelpTarget | null): string {
  if (!t) return '/settings/help'
  return `/settings/help/${encodeURIComponent(t.chapter)}${t.section ? `/${encodeURIComponent(t.section)}` : ''}`
}

/** Every chapter and section HELP_FOR points at must exist in the index. -> the ones that don't. */
export function missingTargets(ix: HelpIndex): string[] {
  const all: HelpTarget[] = [...HELP_FOR.map((e) => e[1]), { chapter: 'tuning-a-print-head' }, { chapter: 'tuning-a-laser-or-drag-knife' }]
  return all
    .filter((t) => !ix.chapters[t.chapter] || (t.section && !ix.chapters[t.chapter]!.sections.some((s) => s.id === t.section)))
    .map((t) => (t.section ? `${t.chapter}/${t.section}` : t.chapter))
}

/** A loaded index, checked enough that a broken file says so instead of breaking the page. */
export function parseIndex(raw: unknown): HelpIndex {
  const ix = raw as HelpIndex
  if (!ix || typeof ix !== 'object' || !Array.isArray(ix.parts) || typeof ix.chapters !== 'object') throw new Error('Help index is unreadable')
  for (const p of ix.parts) for (const k of p.chapters) if (!ix.chapters[k]) throw new Error(`Help index names a missing chapter: ${k}`)
  return ix
}

/**
 * A chapter's HTML, ready to show. The manual build already cleaned it to plain tags; this is the second check: a
 * fragment with anything that could run is refused, not shown. Pictures point into help/.
 */
export function chapterHtml(html: string): string {
  if (/<\s*(script|iframe|object|embed|style|link|meta|form)\b/i.test(html) || /\son[a-z]+\s*=/i.test(html) || /javascript:/i.test(html)) {
    throw new Error('This Help page has markup Studio won’t show')
  }
  return html.replace(/(<img\b[^>]*\ssrc=")(?!https?:|\/|help\/)/g, `$1${HELP_BASE}`)
}

export interface HelpHit { chapter: string; section: string; title: string; where: string; snippet: string; score: number }

const words = (q: string) => q.toLowerCase().split(/[^a-z0-9.°%-]+/).filter((w) => w.length > 1)

/** Search every section: all words must appear; titles count more. Best first, at most `max`. */
export function searchHelp(ix: HelpIndex, q: string, max = 20): HelpHit[] {
  const ws = words(q)
  if (!ws.length) return []
  const hits: HelpHit[] = []
  for (const [key, ch] of Object.entries(ix.chapters)) {
    for (const s of ch.sections) {
      const title = (s.title || ch.title).toLowerCase()
      const text = s.text.toLowerCase()
      if (!ws.every((w) => title.includes(w) || text.includes(w) || ch.title.toLowerCase().includes(w))) continue
      let score = 0
      for (const w of ws) {
        if (title.includes(w)) score += 10
        if (ch.title.toLowerCase().includes(w)) score += 4
        score += Math.min(5, text.split(w).length - 1)
      }
      hits.push({ chapter: key, section: s.id, title: s.title || ch.title, where: s.title ? ch.title : ch.part, snippet: snippet(s.text, ws), score })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, max)
}

/** About 160 characters around the first word found. */
export function snippet(text: string, ws: string[], len = 160): string {
  const low = text.toLowerCase()
  const at = Math.min(...ws.map((w) => low.indexOf(w)).filter((i) => i >= 0), Infinity)
  if (!isFinite(at)) return text.slice(0, len) + (text.length > len ? '…' : '')
  const from = Math.max(0, at - 50)
  const s = text.slice(from, from + len)
  return (from > 0 ? '…' : '') + s + (from + len < text.length ? '…' : '')
}

/** Previous and next chapter, in reading order. */
export function neighbours(ix: HelpIndex, key: string): { prev?: string; next?: string } {
  const order = ix.parts.flatMap((p) => p.chapters)
  const i = order.indexOf(key)
  return i < 0 ? {} : { prev: order[i - 1], next: order[i + 1] }
}
