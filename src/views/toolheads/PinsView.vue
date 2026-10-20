<script setup lang="ts">
/**
 * The board's pin labels, outputs and pins.
 *
 * Pin labels (Tool Manager 1.5.3+) are Klipper pin aliases in [board_pins rhino]:
 * a section that says pin: ENCLOSURE_LIGHT follows the label, so moving the
 * light is one change here. Click a label's pin for the free ones, pick, press
 * the save icon; the old pin shows under it. "Use a label" switches a section
 * that names a raw pin over to a label (one line in that file, backed up
 * first). Aliases in your own [board_pins] sections are shown read-only. Every
 * change waits for a Klipper restart (the banner above).
 */
import { computed, ref } from 'vue'
import { useToolMgrStore } from '@/stores/toolmgr'
import RsButton from '@/components/RsButton.vue'
import PinField from '@/toolmgr/PinField.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import type { RawPinLine } from '@/toolmgr/types'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const tm = useToolMgrStore()
const p = computed(() => tm.pins)
type Show = 'all' | 'free' | 'claimed' | 'tool'
const show = ref<Show>('all')
const SHOW: [Show, string][] = [['all', 'Every pin'], ['free', 'Free'], ['claimed', 'In the config'], ['tool', 'Reserved by a tool']]
const STATE: Record<string, string> = { free: 'Free', claimed: 'In the config', tool: 'Reserved by a tool' }
const count = (s: Show) => (s === 'all' ? (p.value?.pins.length ?? 0) : (p.value?.pins.filter((x) => x.state === s).length ?? 0))
const pins = computed(() => (p.value?.pins ?? []).filter((x) => show.value === 'all' || x.state === show.value))
const hl = ref<string | null>(null)
const shut = ref<Record<string, boolean>>({})

// ---- pin labels -----------------------------------------------------------
const hasLabels = computed(() => !!p.value && Array.isArray(p.value.labels))
const mineLabels = computed(() => (p.value?.labels ?? []).filter((l) => l.editable))
const otherLabels = computed(() => (p.value?.labels ?? []).filter((l) => !l.editable))
/** Pins a label may move to: free ones; ones another label holds are shown, greyed */
const choices = computed(() =>
  (p.value?.free_board_pins ?? []).map((x) => ({
    pin: x.pin,
    note: x.labelled.length ? x.labelled.join(', ') : x.header || (x.connector ? 'tool connector' : ''),
    disabled: x.labelled.length > 0,
  })),
)
const busy = ref<string | null>(null)
const err = ref<string | null>(null)
const note = ref<string | null>(null)
/** alias -> pin before the last save here */
const savedFrom = ref<Record<string, string>>({})

async function run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  busy.value = key
  err.value = null
  note.value = null
  try {
    const r = await fn()
    await tm.changed()
    return r
  } catch (e) {
    err.value = (e as Error).message
    return null
  } finally {
    busy.value = null
  }
}
async function movePin(alias: string, from: string, pin: string) {
  const r = await run(alias, () => tm.client().saveLabel({ original: alias, alias, pin }))
  if (r) {
    savedFrom.value = { ...savedFrom.value, [alias]: from }
    if (r.warnings?.length) note.value = r.warnings.join('. ') + '.'
  }
}
async function removeLabel(alias: string) {
  await run(`rm:${alias}`, () => tm.client().deleteLabel(alias))
}
// add a label
const newName = ref('')
const newPin = ref('')
const nameOk = computed(() => /^[A-Za-z][A-Za-z0-9_]{1,31}$/.test(newName.value.trim()))
async function addLabel() {
  const alias = newName.value.trim().toUpperCase()
  const r = await run('add', () => tm.client().saveLabel({ alias, pin: newPin.value }))
  if (r) {
    note.value = `${alias} = ${newPin.value}. Use it in a section as pin: ${alias}${r.warnings?.length ? ` (${r.warnings.join('; ')})` : ''}.`
    newName.value = ''
    newPin.value = ''
  }
}

// ---- outputs: which use a label, which a raw pin ------------------------------
const labelOf = (section: string) => mineLabels.value.find((l) => l.used_by.some((u) => u.endsWith(`[${section}]`))) ?? null
const rawOf = (section: string): RawPinLine | null => (p.value?.raw_pin_lines ?? []).find((r) => r.section === section && r.key === 'pin') ?? null
const naming = ref<string | null>(null) // section being given a label
const labelName = ref('')
function startLabel(section: string) {
  naming.value = section
  labelName.value = section.split(' ').slice(1).join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 32)
}
async function useLabel(r: RawPinLine) {
  const alias = labelName.value.trim().toUpperCase()
  const res = await run(`use:${r.section}`, () => tm.client().useLabel({ file: r.file, section: r.section, key: r.key, alias }))
  if (res) {
    note.value = `[${r.section}] in ${r.file} now says pin: ${r.value.replace(/[A-Z0-9_]+$/i, alias)}. ${res.made_label ? `The label ${alias} = ${r.pin} was made. ` : ''}The file as it was is kept in rhino_data/config_backups.`
    naming.value = null
  }
}
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Board pins and outputs</h1>
        <p>What the Klipper config does with the board: its outputs (and which tools share them), and every pin it knows about. Adding a tool or system hardware picks from the free ones.</p>
      </div>
    </div>
    <p v-if="!p" class="muted">{{ tm.error ? `Can't reach the Rhino Portal: ${tm.error}` : 'Loading…' }}</p>

    <template v-else>
      <RestartBanner />
      <p v-if="err" class="err" role="alert">{{ err }}</p>
      <p v-if="note" class="note" role="status">{{ note }}</p>

      <section v-if="hasLabels" class="sx-fold" :class="{ open: !shut.lab }">
        <button type="button" class="fh" :aria-expanded="!shut.lab" @click="shut = { ...shut, lab: !shut.lab }">
          <span class="sx-chev" /><span class="ft">Pin labels</span><span class="fm">names for pins: pin: NAME in any section</span>
          <span class="fr"><span class="sx-count">{{ mineLabels.length }}</span></span>
        </button>
        <div v-show="!shut.lab" class="fb">
          <div class="sx-colhead lcols"><span>Label</span><span>Pin</span><span>Used by</span><span /></div>
          <ul class="sx-rows">
            <li v-for="l in mineLabels" :key="l.alias" class="row lcols">
              <span class="mono strong">{{ l.alias }}</span>
              <PinField :value="l.pin" :options="choices" :label="`${l.alias} pin`" :saving="busy === l.alias" :saved-from="savedFrom[l.alias] ?? null" @save="movePin(l.alias, l.pin, $event)" />
              <span class="sm">{{ l.used_by.length ? l.used_by.join(', ') : 'Nothing yet' }}</span>
              <span class="end">
                <RsButton v-if="!l.used_by.length" size="sm" variant="quiet" :disabled="busy === `rm:${l.alias}`" @click="removeLabel(l.alias)">Remove</RsButton>
              </span>
            </li>
            <li v-if="!mineLabels.length" class="row muted sm">No labels yet. Add one below, or use Label it on an output.</li>
          </ul>
          <form class="add" @submit.prevent="nameOk && newPin && addLabel()">
            <label class="tm-fld"><span class="tm-lbl">New label</span><input v-model="newName" class="tm-in code" maxlength="32" placeholder="ENCLOSURE_LIGHT" spellcheck="false" /></label>
            <label class="tm-fld"><span class="tm-lbl">Pin</span>
              <select v-model="newPin" class="tm-sel" aria-label="Pin for the new label">
                <option value="">Choose a free pin…</option>
                <option v-for="o in choices" :key="o.pin" :value="o.pin" :disabled="o.disabled">{{ o.pin }}{{ o.note ? ` · ${o.note}` : '' }}</option>
              </select>
            </label>
            <RsButton type="submit" :disabled="!nameOk || !newPin || busy === 'add'">Add label</RsButton>
          </form>
          <p class="hint">A label is a Klipper pin alias in <code>[board_pins rhino]</code>. Write <code>pin: ENCLOSURE_LIGHT</code> in any section (with <code>!</code> or <code>^</code> in front as usual); moving the label moves every section that uses it.</p>
          <details v-if="otherLabels.length" class="others">
            <summary>{{ otherLabels.length }} aliases in your own files (read-only)</summary>
            <ul class="sx-rows">
              <li v-for="l in otherLabels" :key="`${l.source}|${l.alias}`" class="row lcols">
                <span class="mono strong">{{ l.alias }}</span><span class="mono sm">{{ l.pin }}</span>
                <span class="sm">{{ l.used_by.length ? l.used_by.join(', ') : '—' }}</span><span class="sm muted">{{ l.source }}</span>
              </li>
            </ul>
          </details>
        </div>
      </section>

      <section class="sx-fold" :class="{ open: !shut.out }">
        <button type="button" class="fh" :aria-expanded="!shut.out" @click="shut = { ...shut, out: !shut.out }">
          <span class="sx-chev" /><span class="ft">Outputs</span><span class="fm">output_pin and PWM channels</span>
          <span class="fr"><span class="sx-count">{{ p.channels.length }}</span></span>
        </button>
        <div v-show="!shut.out" class="fb">
          <div class="sx-colhead ocols"><span>Output</span><span>Type</span><span>Pin</span><span>Contact</span><span>Idle level</span><span>Also used by</span></div>
          <ul class="sx-rows">
            <li v-for="c in p.channels" :key="c.name" class="row ocols">
              <span class="mono strong">{{ c.name }}</span>
              <span><span class="sx-tag plain">{{ c.pwm ? 'PWM' : 'On/off' }}</span></span>
              <span class="pincell">
                <template v-if="hasLabels && labelOf(`output_pin ${c.name}`)">
                  <span class="lab">{{ labelOf(`output_pin ${c.name}`)!.alias }}</span>
                  <PinField
                    :value="labelOf(`output_pin ${c.name}`)!.pin"
                    :options="choices"
                    :label="`${c.name} pin`"
                    :saving="busy === labelOf(`output_pin ${c.name}`)!.alias"
                    :saved-from="savedFrom[labelOf(`output_pin ${c.name}`)!.alias] ?? null"
                    @save="movePin(labelOf(`output_pin ${c.name}`)!.alias, labelOf(`output_pin ${c.name}`)!.pin, $event)"
                  />
                </template>
                <template v-else-if="hasLabels && rawOf(`output_pin ${c.name}`)">
                  <span class="mono sm">{{ rawOf(`output_pin ${c.name}`)!.value }}</span>
                  <form v-if="naming === `output_pin ${c.name}`" class="namer" @submit.prevent="useLabel(rawOf(`output_pin ${c.name}`)!)">
                    <input v-model="labelName" class="tm-in code" maxlength="32" :aria-label="`Label for ${c.name}`" spellcheck="false" />
                    <RsButton size="sm" type="submit" :disabled="busy === `use:output_pin ${c.name}`">Use</RsButton>
                    <RsButton size="sm" variant="quiet" @click="naming = null">Cancel</RsButton>
                    <span class="hint">Changes <code>pin:</code> in {{ rawOf(`output_pin ${c.name}`)!.file }} to the label (the file is backed up first).</span>
                  </form>
                  <button v-else type="button" class="linkish" @click="startLabel(`output_pin ${c.name}`)">Label it</button>
                </template>
                <span v-else class="mono sm">{{ c.pin || '—' }}</span>
              </span>
              <span class="sm">{{ c.contact ? `Contact ${c.contact}` : c.hardware ? 'System hardware' : '—' }}</span>
              <span class="mono sm">{{ c.value == null ? '—' : c.value }}</span>
              <span class="sm">{{ c.shared_with || '—' }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="sx-fold" :class="{ open: !shut.pins }">
        <button type="button" class="fh" :aria-expanded="!shut.pins" @click="shut = { ...shut, pins: !shut.pins }">
          <span class="sx-chev" /><span class="ft">Pins</span><span class="fm">{{ count('free') }} free</span>
          <span class="fr"><span class="sx-count">{{ p.pins.length }}</span></span>
        </button>
        <div v-show="!shut.pins" class="fb">
          <div class="sx-bar">
            <div class="sx-seg" role="group" aria-label="Show pins">
              <button v-for="[k, l] in SHOW" :key="k" type="button" :class="{ on: show === k }" :aria-pressed="show === k" @click="show = k">{{ l }} <span class="n">{{ count(k) }}</span></button>
            </div>
          </div>
          <!-- the pin map: one square per pin, filled by state -->
          <div class="map" role="list" aria-label="Pin map">
            <span v-for="x in pins" :key="x.pin" role="listitem" class="sq" :class="[x.state, { hl: hl === x.pin }]" :title="`${x.pin}: ${STATE[x.state] ?? x.state}${x.owner ? ` · ${x.owner}` : ''}`" @mouseenter="hl = x.pin" @mouseleave="hl = null">{{ x.pin }}</span>
          </div>
          <div class="legend"><span><i class="sq free" />Free</span><span><i class="sq claimed" />In the config</span><span><i class="sq tool" />Reserved by a tool</span></div>
          <ul class="sx-rows">
            <li v-for="x in pins" :key="x.pin" class="row pcols" :class="{ hl: hl === x.pin }" @mouseenter="hl = x.pin" @mouseleave="hl = null">
              <span class="mono strong">{{ x.pin }}</span>
              <span class="sm"><i class="sq small" :class="x.state" />{{ STATE[x.state] ?? x.state }}</span>
              <span class="mono sm">{{ x.owner || '—' }}</span>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ocols { grid-template-columns: minmax(150px, 1.1fr) 70px minmax(180px, 1.3fr) minmax(90px, 0.7fr) 70px minmax(140px, 1.3fr); align-items: center; }
.lcols { grid-template-columns: minmax(150px, 1fr) minmax(170px, 1fr) minmax(0, 1.6fr) 90px; align-items: center; }
.end { display: flex; justify-content: flex-end; }
.pincell { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; min-width: 0; }
.lab { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); font-weight: 600; color: var(--rs-text-strong); }
.linkish { border: 0; padding: 0; background: none; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-xs); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.namer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.namer .tm-in { width: 170px; padding: 4px 8px; }
.add { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--rs-space-3); margin-top: var(--rs-space-3); padding-top: var(--rs-space-3); border-top: 1px dotted var(--rs-line-strong); }
.add .tm-fld { margin: 0; }
.hint { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.hint code, .namer code { font-family: var(--rs-font-code); }
.others { margin-top: var(--rs-space-3); font-size: var(--rs-text-sm); }
.others summary { cursor: pointer; color: var(--rs-text-muted); }
.err { color: var(--rs-danger); font-size: var(--rs-text-sm); }
.note { font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.muted { color: var(--rs-text-muted); }
.pcols { grid-template-columns: 70px 180px minmax(0, 1fr); align-items: center; }
.row { display: grid; gap: var(--rs-space-4); padding: var(--rs-space-2) var(--rs-space-1); border-radius: var(--rs-radius-sm); }
.row.hl { background: var(--rs-surface-2); }
.mono { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); }
.strong { color: var(--rs-text-strong); }
.sm { font-size: var(--rs-text-xs); color: var(--rs-text); }
.map { display: flex; flex-wrap: wrap; gap: 6px; }
.sq { display: inline-grid; place-items: center; min-width: 48px; height: 28px; padding: 0 6px; border-radius: 4px; border: 1.4px solid var(--rs-text-muted); font-family: var(--rs-font-code); font-size: 11px; color: var(--rs-text); font-style: normal; }
.sq.claimed { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.sq.tool { background: var(--rs-dither-dense), var(--rs-surface); border-color: var(--rs-ink); color: var(--rs-text-strong); font-weight: 600; }
.sq.hl { outline: 2px solid var(--rs-ink); outline-offset: 2px; }
.legend { display: flex; gap: var(--rs-space-5); flex-wrap: wrap; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend .sq, .sq.small { min-width: 0; width: 14px; height: 14px; padding: 0; border-radius: 3px; font-size: 0; }
.sq.small { margin-right: 8px; vertical-align: -2px; }
@media (max-width: 760px) {
  .sx-colhead { display: none; }
  .ocols, .lcols { grid-template-columns: 1fr auto; }
  .lcols > :nth-child(n + 3) { grid-column: 1 / -1; }
  .ocols > :nth-child(n + 3) { grid-column: 1 / -1; }
  .pcols { grid-template-columns: 60px 1fr; }
  .pcols > :nth-child(3) { grid-column: 1 / -1; }
}
</style>
