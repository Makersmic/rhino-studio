/**
 * Klipper prompts: the pop-ups the Rhino wizards ask through
 * (RESPOND TYPE=command MSG="action:prompt_...").
 *
 * Klipper prints them as "// action:prompt_begin <title>", "... prompt_text",
 * "... prompt_button <label>|<command>|<colour>", "... prompt_show",
 * "... prompt_end". Studio builds the same question Mainsail draws from the
 * same lines, so both always show the same thing.
 *
 * Ported from the Rhino Portal's rhino/slice/prompts.py (Toolhead_Manager,
 * prototype/kiri-moto branch), same rules.
 */

export interface PromptButton {
  label: string
  command: string
  color: 'primary' | 'secondary' | 'info' | 'warning' | 'error' | 'success'
}

export type PromptItem = { text: string } | { group: PromptButton[] }

export interface Prompt {
  id: string
  title: string
  items: PromptItem[]
  footer: PromptButton[]
}

const PREFIX = 'action:'
const COLORS = new Set(['primary', 'secondary', 'info', 'warning', 'error', 'success'])

function parseButton(body: string): PromptButton {
  const bits = body.split('|')
  const label = (bits[0] ?? '').trim()
  const command = bits[1]?.trim() || label
  const c = bits[2]?.trim() ?? ''
  return { label, command, color: (COLORS.has(c) ? c : 'secondary') as PromptButton['color'] }
}

/** Strips Klipper's "// " so we see "action:prompt_...", or returns null for other lines. */
export function actionOf(line: string): string | null {
  const t = line.trim().replace(/^\/\/\s*/, '')
  return t.startsWith(PREFIX) ? t.slice(PREFIX.length) : null
}

/**
 * Feed Klipper's output in order; ask current() for the question showing now.
 * Lines typed by a person (Moonraker store type "command") must not be fed.
 */
export class PromptTracker {
  private building: (Prompt & { group: PromptButton[] | null }) | null = null
  private shown: Prompt | null = null
  private seq = 0

  feed(line: string, time = Date.now() / 1000): void {
    for (const raw of line.split(/\r?\n/)) {
      const a = actionOf(raw)
      if (a == null) continue
      if (a.startsWith('prompt_begin')) {
        const title = a.slice('prompt_begin'.length).trim()
        this.building = { id: `${time}-${this.seq++}-${title}`, title, items: [], footer: [], group: null }
        this.shown = null
      } else if (!this.building) {
        if (a.startsWith('prompt_end')) this.shown = null
      } else if (a.startsWith('prompt_text')) {
        this.building.items.push({ text: a.slice('prompt_text'.length).trim() })
      } else if (a.startsWith('prompt_button_group_start')) {
        this.building.group = []
        this.building.items.push({ group: this.building.group })
      } else if (a.startsWith('prompt_button_group_end')) {
        this.building.group = null
      } else if (a.startsWith('prompt_footer_button')) {
        this.building.footer.push(parseButton(a.slice('prompt_footer_button'.length).trim()))
      } else if (a.startsWith('prompt_button')) {
        const b = parseButton(a.slice('prompt_button'.length).trim())
        if (this.building.group) this.building.group.push(b)
        else this.building.items.push({ group: [b] })
      } else if (a.startsWith('prompt_show')) {
        const { group: _g, ...p } = this.building
        this.shown = { ...p, items: p.items.map((i) => ('group' in i ? { group: [...i.group] } : i)), footer: [...p.footer] }
      } else if (a.startsWith('prompt_end')) {
        this.building = null
        this.shown = null
      }
    }
  }

  /** Close locally (the button already told Klipper). */
  dismiss(): void {
    this.building = null
    this.shown = null
  }

  current(): Prompt | null {
    return this.shown
  }
}
