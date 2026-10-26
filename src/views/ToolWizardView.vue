<script setup lang="ts">
/**
 * Add a toolhead, step by step, as the Rhino Portal's wizard does: what kind
 * of tool, how it's wired (its outputs, or the connector contacts, or the
 * print head it copies), its limits and materials, its extra controls and
 * macros, then a review the Portal checks against the whole Klipper config.
 *
 * Create sends it to the Portal, which writes the registry and
 * custom_tools.cfg; the tool works after the next Klipper restart. Nothing
 * here switches anything on or moves the machine.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import ToolConnector from '@/toolmgr/ToolConnector.vue'
import MaterialsTable from '@/toolmgr/MaterialsTable.vue'
import ItemsPanel from '@/toolmgr/ItemsPanel.vue'
import {
  applyKindPreset,
  checkStep,
  ctlMacroNames,
  describeOutput,
  kindOf,
  newDraft,
  outputChoices,
  outputContact,
  roleLabel,
  typeOf,
  wizNozzles,
  wizPayload,
  wizSteps,
  type Draft,
  type Step,
} from '@/toolmgr/form'
import type { ToolOptions, WriteResult } from '@/toolmgr/types'
import { useToolMgrStore } from '@/stores/toolmgr'
import '@/toolmgr/forms.css'

const router = useRouter()
const tm = useToolMgrStore()
onBeforeUnmount(tm.use())

const opt = ref<ToolOptions | null>(null)
const d = reactive<Draft>(newDraft())
const at = ref(0)
const error = ref<string | null>(null)
const review = ref<WriteResult | null>(null)
const checking = ref(false)
const creating = ref(false)
const photos = ref<File[]>([])

onMounted(async () => {
  try {
    opt.value = await tm.loadOptions(true)
  } catch (e) {
    error.value = (e as Error).message
  }
})

const o = computed(() => opt.value!)
const steps = computed<Step[]>(() => (opt.value ? wizSteps(opt.value, d) : ['Tool', 'Review']))
const step = computed(() => steps.value[Math.min(at.value, steps.value.length - 1)]!)
const type = computed(() => (opt.value ? typeOf(opt.value, d) : ''))
const kinds = computed(() => (opt.value ? opt.value.kinds.filter((k) => k.category === d.category) : []))
const existing = computed(() => tm.tools.map((t) => t.name))
const outputLocked = computed(() => (opt.value ? d.outputs.map((r) => outputContact(o.value, r.source)).filter((c): c is number => c != null) : []))
const pinRows = computed(() => d.outputs.filter((r) => r.source.startsWith('pin:')).map((r) => r.source.slice(4)))
const draftCtx = computed(() => ({ draft: { name: d.name.trim(), new_pin: pinRows.value[0] ?? '', new_enable_pin: pinRows.value[1] ?? '', controls: d.controls, macros: d.macros } }))
const STEP_HELP: Record<Step, string> = {
  Tool: 'What it is and what it is called',
  Outputs: 'The contacts that power and switch it',
  Connector: 'The contacts it connects to',
  Hardware: 'The print head it copies, nozzle sizes',
  Limits: 'Power cap, watchdog',
  Materials: 'Presets for jobs, pre-job checklist',
  Controls: 'Extra outputs and inputs',
  Macros: 'G-code that belongs to it',
  Review: 'Checked against your config',
}

function pickCategory(v: string) {
  d.category = v
  const ks = kinds.value
  d.kind = ks.length === 1 ? ks[0]!.value : ''
  if (d.kind) applyKindPreset(o.value, d)
}
function pickKind() {
  if (d.kind) applyKindPreset(o.value, d)
}
function toggleNozzle(v: string, on: boolean) {
  d.nozzles = d.nozzles.filter((x) => x !== v)
  if (on) d.nozzles.push(v)
}

async function next() {
  error.value = null
  if (step.value !== 'Review') {
    const err = checkStep(o.value, d, step.value, existing.value)
    if (err) return (error.value = err)
    at.value++
    return
  }
  await create()
}
function back() {
  error.value = null
  at.value = Math.max(0, at.value - 1)
}
function goTo(i: number) {
  if (i < at.value) {
    error.value = null
    at.value = i
  }
}

// The review asks the Portal to check the whole tool (it writes nothing)
watch(step, async (s) => {
  review.value = null
  if (s !== 'Review' || !opt.value) return
  checking.value = true
  try {
    review.value = await tm.client().checkTool(wizPayload(o.value, d))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    checking.value = false
  }
})

async function create() {
  if (creating.value || !review.value) return
  creating.value = true
  error.value = null
  try {
    const r = await tm.client().addTool(wizPayload(o.value, d))
    const name = String(r.name ?? d.name.trim())
    let failed = 0
    for (const f of photos.value) {
      try {
        await tm.client().addPhoto(name, f, f.name)
      } catch {
        failed++
      }
    }
    await tm.changed()
    router.push({ path: `/assets/toolheads/${encodeURIComponent(name)}`, query: failed ? { photos_failed: String(failed) } : {} })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    creating.value = false
  }
}

const reviewRows = computed<[string, string][]>(() => {
  if (!opt.value) return []
  const p = wizPayload(o.value, d)
  const rows: [string, string][] = [['Name', String(p.name)], ['Kind', `${o.value.categories.find((c) => c.value === d.category)?.label ?? ''} · ${kindOf(o.value, d)?.label ?? ''}`]]
  if (type.value === 'POWERED') {
    rows.push(['Main power', describeOutput(o.value, d.outputs.find((r) => r.role === 'power')?.source ?? '')])
    rows.push(['Switch outputs', d.outputs.filter((r) => r.role === 'switch').map((r) => describeOutput(o.value, r.source)).join('; ') || 'none'])
    rows.push(['Limits', `cap ${d.cap}%, min ${d.min}%, idle ${d.idle}%, at most ${d.max_on_s} s on, S${d.s_max} = full`])
  }
  if (type.value === 'DEPOSITION') rows.push(['Copies', d.base], ['Nozzles', wizNozzles(d)])
  if (p.materials) rows.push(['Materials', (p.materials as { name: string }[]).map((m) => m.name).join(', ') || '—'])
  if (d.contacts.length || outputLocked.value.length) rows.push(['Contacts', [...new Set([...d.contacts, ...outputLocked.value])].sort((a, b) => a - b).join(', ')])
  rows.push(['Controls', d.controls.map((c) => `${c.name} (${roleLabel(c.role)}, ${c.pin})`).join(', ') || 'none'])
  rows.push(['Macros', [...d.macros.map((m) => m.name), ...ctlMacroNames(d.controls)].join(', ') || 'none'])
  return rows
})

function onPhotos(e: Event) {
  photos.value = [...((e.target as HTMLInputElement).files ?? [])].slice(0, 6)
}
</script>

<template>
  <div class="view">
    <RouterLink to="/assets/toolheads" class="back">‹ Toolheads</RouterLink>
    <div class="view-head">
      <h1>Add a toolhead</h1>
      <p>The Portal checks every step against your Klipper config before anything is written. The new tool works after the next Klipper restart.</p>
    </div>

    <p v-if="!opt && !error" class="muted">Loading the choices from the Portal…</p>

    <template v-if="opt">
      <ol class="wsteps" aria-label="Steps">
        <li v-for="(s, i) in steps" :key="s" :class="{ now: i === at, done: i < at }" :aria-current="i === at ? 'step' : undefined">
          <component :is="i < at ? 'button' : 'span'" type="button" class="in" @click="goTo(i)">
            <span class="num">{{ i < at ? '✓' : String(i + 1).padStart(2, '0') }}</span>
            <span class="txt"><span class="lab">{{ s }}</span><span class="det">{{ STEP_HELP[s] }}</span></span>
          </component>
        </li>
      </ol>

      <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${step}`" panel-id="wizard.step">
        <div class="stepbody">
          <!-- ===== Tool ===== -->
          <template v-if="step === 'Tool'">
            <fieldset class="tm-set">
              <legend>What kind of tool is it?</legend>
              <div class="cats">
                <label v-for="c in o.categories" :key="c.value" class="tm-radio cat" :class="{ on: d.category === c.value }">
                  <input type="radio" name="cat" :checked="d.category === c.value" @change="pickCategory(c.value)" />
                  <span><strong>{{ c.label }}</strong><br /><span class="tm-hint">{{ c.help }}</span></span>
                </label>
              </div>
            </fieldset>
            <div v-if="d.category" class="tm-fld">
              <label for="wz-kind">Which {{ o.categories.find((c) => c.value === d.category)?.label.toLowerCase() }} tool?</label>
              <select id="wz-kind" v-model="d.kind" class="tm-sel" @change="pickKind">
                <option value="">Choose one…</option>
                <option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.label }}</option>
              </select>
              <span class="tm-hint">{{ kindOf(o, d)?.help || 'Pick the closest match: it sets safe starting values you can change.' }}</span>
            </div>
            <div class="tm-fld">
              <label for="wz-name">Name</label>
              <input id="wz-name" v-model="d.name" class="tm-in" maxlength="24" placeholder="e.g. FoamWire" />
              <span class="tm-hint">2-24 characters: letters, digits and _, starting with a letter. This is the name used in G-code and slicers. It becomes slot {{ o.next_slot }}.</span>
            </div>
            <div class="tm-fld">
              <label for="wz-notes">Notes (optional)</label>
              <textarea id="wz-notes" v-model="d.notes" class="tm-ta" maxlength="1000" placeholder="Wiring, supplier, settings that worked…" />
            </div>
          </template>

          <!-- ===== Outputs (powered) ===== -->
          <template v-if="step === 'Outputs'">
            <p class="tm-lead">Which umbilical contacts power and switch this tool. The main power level is what M3 S sets; switch outputs turn on with the tool and off with it (an enable line, a relay, a vacuum).</p>
            <div class="tm-list">
              <div v-for="(r, i) in d.outputs" :key="i" class="tm-item outrow">
                <select v-model="r.role" class="tm-sel role" aria-label="What this output does">
                  <option v-for="[v, l] in o.output_roles" :key="v" :value="v">{{ l }}</option>
                </select>
                <select v-model="r.source" class="tm-sel src" aria-label="Contact or pin">
                  <option value="">Choose the contact or pin…</option>
                  <optgroup v-for="[g, items] in outputChoices(o, r.role)" :key="g" :label="g">
                    <option v-for="[v, l] in items" :key="v" :value="v">{{ l }}</option>
                  </optgroup>
                </select>
                <button v-if="d.outputs.length > 1" type="button" class="tm-link danger" @click="d.outputs.splice(i, 1)">Remove</button>
              </div>
            </div>
            <button v-if="d.outputs.length < 6" type="button" class="tm-link" @click="d.outputs.push({ role: 'switch', source: '' })">+ Add an output</button>
            <div v-if="d.outputs.some((r) => r.source.startsWith('pin:'))" class="tm-fld narrow">
              <label for="wz-cycle">PWM cycle time for a new main power pin (s)</label>
              <input id="wz-cycle" v-model="d.cycle" class="tm-in" type="number" step="any" />
              <span class="tm-hint">0.01 (100 Hz) suits heaters and most drivers; 0.0001 for fast power stages.</span>
            </div>
            <fieldset class="tm-set">
              <legend>Contacts this tool uses</legend>
              <ToolConnector v-model="d.contacts" :contacts="o.contacts" :locked="outputLocked" pickable />
              <span class="tm-hint">Contacts its outputs drive are inked for you. Select the returns, supplies and signal lines it also uses.</span>
            </fieldset>
          </template>

          <!-- ===== Connector (passive) ===== -->
          <template v-if="step === 'Connector'">
            <p class="tm-lead">This tool has no power output. Select the contacts it still connects to (the probe, a sensor, the tool-present line), so its page and the pin map are complete.</p>
            <ToolConnector v-model="d.contacts" :contacts="o.contacts" pickable />
            <p class="tm-hint">{{ d.contacts.length }} selected: {{ d.contacts.join(', ') || 'none' }}</p>
          </template>

          <!-- ===== Hardware (print-head clone) ===== -->
          <template v-if="step === 'Hardware'">
            <div class="tm-fld narrow">
              <label for="wz-base">Copy settings from</label>
              <select id="wz-base" v-model="d.base" class="tm-sel"><option v-for="b in o.print_bases" :key="b" :value="b">{{ b }}</option></select>
              <span class="tm-hint">Same extruder, heater and thermistor as this tool; only the nozzle size changes.</span>
            </div>
            <fieldset class="tm-set">
              <legend>Nozzle sizes</legend>
              <div class="chips">
                <label v-for="n in o.nozzles" :key="n" class="chip" :class="{ on: d.nozzles.includes(String(n)) }">
                  <input type="checkbox" :checked="d.nozzles.includes(String(n))" @change="toggleNozzle(String(n), ($event.target as HTMLInputElement).checked)" />{{ n }} mm
                </label>
              </div>
              <div class="tm-fld narrow">
                <label for="wz-noz">Other sizes (mm, optional)</label>
                <input id="wz-noz" v-model="d.nozzles_other" class="tm-in" placeholder="0.35, 1.4" />
              </div>
            </fieldset>
            <fieldset class="tm-set">
              <legend>Contacts this tool uses</legend>
              <ToolConnector v-model="d.contacts" :contacts="o.contacts" pickable />
            </fieldset>
          </template>

          <!-- ===== Limits ===== -->
          <template v-if="step === 'Limits'">
            <p class="tm-lead">These limits protect the tool. Percentages are of the output's full range. Start low and raise them while watching the tool.</p>
            <div class="tm-row">
              <label class="tm-fld"><span class="tm-lbl">Power cap %</span><input v-model="d.cap" class="tm-in" type="number" min="5" max="100" /><span class="tm-hint">Hard ceiling, whatever the G-code asks for.</span></label>
              <label class="tm-fld"><span class="tm-lbl">Minimum power %</span><input v-model="d.min" class="tm-in" type="number" min="0" max="100" /><span class="tm-hint">Output at the lowest non-zero request.</span></label>
              <label class="tm-fld"><span class="tm-lbl">Idle level %</span><input v-model="d.idle" class="tm-in" type="number" min="0" max="100" /><span class="tm-hint">Output when the tool is off. Leave 0 unless the driver needs a neutral signal.</span></label>
              <label class="tm-fld"><span class="tm-lbl">Max time on (s)</span><input v-model="d.max_on_s" class="tm-in" type="number" min="1" max="3600" /><span class="tm-hint">Watchdog: the output is cut after this long without a new power command.</span></label>
              <label class="tm-fld"><span class="tm-lbl">S value for full power</span><input v-model="d.s_max" class="tm-in" type="number" min="1" /><span class="tm-hint">M3 S is scaled against this (1000: S1000 is 100%).</span></label>
            </div>
          </template>

          <!-- ===== Materials ===== -->
          <template v-if="step === 'Materials'">
            <p class="tm-lead">Materials are the presets you pick when starting a job: what to cut or draw, and how fast.</p>
            <MaterialsTable :rows="d.materials" :type="type" :names="o.material_names[d.category] ?? []" @add="d.materials.push({ name: '', power: type === 'POWERED' ? 50 : undefined, feed_rate: 600, z_offset: 0 })" @remove="(i) => d.materials.splice(i, 1)" />
            <div class="tm-fld">
              <label for="wz-check">Pre-job checklist (one item per line)</label>
              <textarea id="wz-check" v-model="d.checklist" class="tm-ta" />
              <span class="tm-hint">Shown as a list to confirm before every job with this tool.</span>
            </div>
          </template>

          <!-- ===== Controls / Macros ===== -->
          <ItemsPanel v-if="step === 'Controls'" kind="control" :list="d.controls" :ctx="draftCtx" :tool-name="d.name.trim() || 'NewTool'" :options="o" :pins-taken="type === 'POWERED' ? pinRows : []" />
          <ItemsPanel v-if="step === 'Macros'" kind="macro" :list="d.macros" :controls="d.controls" :ctx="draftCtx" :tool-name="d.name.trim() || 'NewTool'" :options="o" />

          <!-- ===== Review ===== -->
          <template v-if="step === 'Review'">
            <dl class="review">
              <template v-for="[k, v] in reviewRows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
            </dl>
            <p v-if="checking" class="tm-hint">Checking everything against your Klipper config…</p>
            <template v-if="review">
              <div v-for="(w, i) in review.warnings ?? []" :key="i" class="tm-warn">{{ w }}</div>
              <p class="tm-ok">Ready: this becomes slot {{ review.slot }}. It works after the next Klipper restart.</p>
              <div class="tm-fld">
                <span class="tm-lbl">Photos (optional, up to 6)</span>
                <label class="pick">
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple @change="onPhotos" />
                  <span>{{ photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} chosen: ${photos.map((f) => f.name).join(', ')}` : '+ Choose photos' }}</span>
                </label>
                <span class="tm-hint">Saved with the tool when you create it. You can add more later with Edit tool.</span>
              </div>
            </template>
          </template>
        </div>
      </RsPanel>

      <p v-if="error" class="tm-err" role="alert">{{ error }}</p>
      <footer class="bar">
        <RsButton v-if="at > 0" @click="back">Back</RsButton>
        <RsButton variant="primary" :disabled="(step === 'Review' && (!review || checking)) || creating" @click="next">
          {{ step === 'Review' ? (creating ? 'Creating…' : 'Create tool') : 'Next' }}
        </RsButton>
        <span class="tm-hint">Step {{ at + 1 }} of {{ steps.length }}</span>
        <RsButton class="cancel" variant="quiet" @click="router.push('/assets/toolheads')">Cancel</RsButton>
      </footer>
    </template>
    <p v-else-if="error" class="tm-err">{{ error }}</p>
  </div>
</template>

<style scoped>
.back { align-self: flex-start; font-size: var(--rs-text-sm); color: var(--rs-text-strong); text-decoration: none; }
.back:hover { text-decoration: underline; text-underline-offset: 3px; }
.muted { color: var(--rs-text-muted); }
.wsteps { list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; }
.wsteps li { min-width: 0; }
.wsteps .in { display: flex; align-items: flex-start; gap: 10px; width: 100%; height: 100%; padding: 10px 12px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text); font: inherit; text-align: left; }
button.in { cursor: pointer; }
button.in:hover { border-color: var(--rs-line-strong); }
.num { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-text-muted); padding-top: 1px; }
.txt { display: flex; flex-direction: column; min-width: 0; }
.lab { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.det { font-size: 11px; color: var(--rs-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.now .in { background: var(--rs-ink); border-color: var(--rs-ink); }
.now .lab, .now .num { color: var(--rs-on-ink); }
.now .det { color: var(--rs-on-ink); opacity: 0.75; }
.done .num { color: var(--rs-text-strong); }
.stepbody { display: flex; flex-direction: column; gap: var(--rs-space-4); }
.stepbody > .tm-link { align-self: flex-start; }
.pick { position: relative; display: flex; align-items: center; min-height: 64px; padding: 0 var(--rs-space-4); border: 1.5px dashed var(--rs-line-strong); border-radius: var(--rs-radius-md); font-size: var(--rs-text-sm); color: var(--rs-text-strong); cursor: pointer; max-width: 520px; }
.pick input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.pick:hover { border-color: var(--rs-ink); }
.pick:focus-within { outline: 2px solid var(--rs-ink); outline-offset: 1px; }
.cats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--rs-space-2); }
.cat { height: 100%; }
.narrow { max-width: 340px; }
.outrow { flex-wrap: wrap; }
.outrow .role { flex: 0 1 260px; }
.outrow .src { flex: 1 1 320px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-pill); font-size: var(--rs-text-sm); cursor: pointer; }
.chip input { width: 14px; height: 14px; accent-color: var(--rs-text-strong); }
.chip.on { border-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); color: var(--rs-text-strong); }
.review { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 8px var(--rs-space-5); margin: 0; font-size: var(--rs-text-sm); }
.review dt { color: var(--rs-text-muted); }
.review dd { margin: 0; color: var(--rs-text-strong); overflow-wrap: anywhere; }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.cancel { margin-left: auto; }
@media (max-width: 900px) {
  .wsteps { grid-auto-flow: row; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .det { display: none; }
}
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
