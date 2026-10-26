<script setup lang="ts">
/**
 * Add or edit one control (an extra output or input the tool brings) or one
 * macro. As you type, the Portal checks it against the whole Klipper config
 * and returns the exact text it will write to custom_tools.cfg; Save is only
 * possible once that check passes. Nothing is written here: the item goes back
 * to the tool form, which saves it with the tool.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useToolMgrStore } from '@/stores/toolmgr'
import { controlPins, ctlMacroNames, draftToControl, hardwarePins, type ControlDraft } from './form'
import type { ToolControl, ToolMacro, ToolOptions } from './types'
import './forms.css'

type MacroDraft = ToolMacro & { original?: string }

const props = defineProps<{
  kind: 'control' | 'macro'
  item: ControlDraft | MacroDraft | null
  /** the tool's other controls or macros (this one left out) */
  others: (ToolControl | ToolMacro)[]
  /** for macros: the tool's controls (their generated macro names are taken) */
  controls?: ToolControl[]
  /** where the item lives: { tool: name } in the editor, { draft: {...} } in the wizard */
  ctx: Record<string, unknown>
  toolName: string
  options: ToolOptions
  pinsTaken: string[]
  pinsMine: string[]
  /**
   * System hardware (a control wired to the board, not the tool connector):
   * board pins, a category and notes, checked with the hardware preview, and
   * saved straight to the Portal by `submit` (the dialog shows its refusal).
   */
  hardware?: boolean
  submit?: (item: ToolControl) => Promise<void>
}>()
const emit = defineEmits<{ close: []; save: [item: ToolControl | ToolMacro]; remove: [] }>()

const tm = useToolMgrStore()
const dlg = ref<HTMLDialogElement | null>(null)
const last = ref<{ ok: boolean; text?: string; warnings?: string[]; item?: ToolControl | ToolMacro; error?: string } | null>(null)
let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.item,
  async (it) => {
    if (!it) return dlg.value?.open && dlg.value.close()
    last.value = null
    await nextTick()
    if (!dlg.value?.open) dlg.value?.showModal()
    schedule(0)
  },
  { immediate: true },
)
onBeforeUnmount(() => timer && clearTimeout(timer))

const c = computed(() => props.item as ControlDraft)
const m = computed(() => props.item as MacroDraft)
const isNew = computed(() => !(props.item as { original?: string })?.original)

function payload(): ToolControl | ToolMacro {
  return props.kind === 'control' ? draftToControl(c.value) : { ...m.value }
}

function schedule(ms = 350) {
  if (timer) clearTimeout(timer)
  last.value = null
  timer = setTimeout(run, ms)
}

async function run() {
  if (!props.item) return
  const n = ++seq
  const item = payload()
  const key = props.kind === 'macro' ? 'macros' : 'controls'
  const body: Record<string, unknown> = { ...props.ctx, item }
  if (body.draft) {
    body.draft = { ...(body.draft as object), [key]: props.others }
    if (props.kind === 'macro' && props.controls) (body.draft as Record<string, unknown>).controls = props.controls
  } else {
    body[key] = props.others
    if (props.kind === 'macro' && props.controls) body.controls = props.controls
  }
  try {
    const r = props.hardware ? await tm.client().previewHardware(item) : await tm.client().preview(props.kind, body)
    if (n !== seq) return
    last.value = { ok: true, text: r.text, warnings: r.warnings, item: r.item }
  } catch (e) {
    if (n !== seq) return
    last.value = { ok: false, error: (e as Error).message }
  }
}

async function save() {
  if (!last.value) {
    if (timer) clearTimeout(timer)
    await run()
  }
  if (!last.value?.ok || !last.value.item) return
  if (!props.submit) return emit('save', last.value.item)
  saving.value = true
  saveError.value = null
  try {
    await props.submit({ ...(last.value.item as ToolControl), original: (props.item as ControlDraft).original ?? '' })
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
const saving = ref(false)
const saveError = ref<string | null>(null)
watch(() => props.item, () => (saveError.value = null))

// ---- control choices
const roles = computed(() => props.options.control_roles.filter((r) => r.value !== 'input' && (r.value !== 'heater_fan' || props.options.heaters.length)))
const pins = computed(() => {
  if (props.kind !== 'control') return []
  const role = c.value.dir === 'in' ? 'input' : c.value.role
  return props.hardware ? hardwarePins(props.options, role, props.pinsMine) : controlPins(props.options, role, props.pinsTaken, props.pinsMine)
})
const typedPin = computed({
  get: () => (c.value.pin && !pins.value.some((p) => p.pin === c.value.pin) ? c.value.pin : ''),
  set: (v: string) => {
    c.value.pin = v.trim().toUpperCase()
    schedule()
  },
})
const what = computed(() => (props.hardware ? 'system hardware' : props.kind))
// ---- Scan Config (system hardware, Tool Manager 1.5.3+) --------------------------------
const scanning = ref(false)
type ScanLabel = { alias: string; pin: string; editable: boolean; source: string; block: string | null }
const scan = ref<{ error?: string; labels: ScanLabel[]; raw: { file: string; section: string; key: string; pin: string }[] } | null>(null)
async function scanConfig() {
  scanning.value = true
  try {
    await tm.refresh()
    const p = tm.pins
    if (!p || !Array.isArray(p.labels)) {
      scan.value = { error: 'This Rhino Tool Manager is too old to scan the config (1.5.3 or newer).', labels: [], raw: [] }
      return
    }
    const onConnector = new Set([...props.options.contacts.map((x) => x.pin).filter(Boolean), ...Object.keys(props.options.pin_info ?? {})])
    const editingLabel = (props.item as ControlDraft | null)?.pin ?? ''
    scan.value = {
      labels: p.labels.map((l) => ({
        ...l,
        block: l.used_by.length && l.alias !== editingLabel ? `used by ${l.used_by.join(', ')}` : onConnector.has(l.pin) ? 'on the tool connector' : null,
      })),
      raw: (p.raw_pin_lines ?? []).slice().sort((a, b) => a.pin.localeCompare(b.pin, undefined, { numeric: true })),
    }
  } catch (e) {
    scan.value = { error: `Couldn't scan: ${(e as Error).message}`, labels: [], raw: [] }
  } finally {
    scanning.value = false
  }
}
function pickLabel(alias: string) {
  if (!c.value) return
  c.value.pin = alias
  schedule(0)
}

const pinInfo = computed(() => props.options.pin_info[c.value?.pin ?? ''] ?? {})
const genNames = computed(() => (props.kind === 'control' ? ctlMacroNames([{ ...draftToControl(c.value), make_macros: true, name: c.value.name || 'name' }]) : []))
const madeByControls = computed(() => ctlMacroNames(props.controls ?? []))
const actions = (key: 'on_press' | 'on_release') => props.options.input_actions.filter(([k]) => key === 'on_press' || (k !== 'pause' && k !== 'estop'))
function setDir(dir: 'out' | 'in') {
  c.value.dir = dir
  if (dir === 'in') c.value.role = 'input'
  else if (c.value.role === 'input') c.value.role = 'switch'
  schedule(0)
}
const step = computed(() => (c.value?.dir === 'out' ? 4 : 3))
</script>

<template>
  <dialog ref="dlg" class="dlg" aria-labelledby="item-title" @cancel.prevent="emit('close')">
    <form v-if="item" class="body" @submit.prevent="save">
      <h2 id="item-title">{{ isNew ? 'New' : 'Edit' }} {{ what }}{{ hardware ? (isNew ? '' : ` · ${(item as ControlDraft).original}`) : ` · ${toolName}` }}</h2>

      <!-- ===== macro ===== -->
      <template v-if="kind === 'macro'">
        <div class="tm-row">
          <div class="tm-fld">
            <label for="mac-name">Macro name</label>
            <input id="mac-name" v-model="m.name" class="tm-in code" maxlength="40" placeholder="NEEDLE_PURGE" @input="m.name = m.name.toUpperCase(); schedule()" />
            <span class="tm-hint">Letters, digits and _. Klipper ignores case, so it's saved in capitals. It mustn't clash with another macro or command.</span>
          </div>
          <div class="tm-fld">
            <label for="mac-purpose">Purpose</label>
            <input id="mac-purpose" v-model="m.purpose" class="tm-in" maxlength="120" placeholder="Purge the needle before a cut" @input="schedule()" />
            <span class="tm-hint">One line, shown in Mainsail's macro list and the console.</span>
          </div>
        </div>
        <label class="tm-check"><input v-model="m.mounted_only" type="checkbox" @change="schedule(0)" /> Only run when this tool is mounted (refused with a message otherwise)</label>
        <div class="tm-fld">
          <label for="mac-body">Macro</label>
          <textarea id="mac-body" v-model="m.body" class="tm-ta code" rows="10" spellcheck="false" placeholder="G91&#10;G1 Z5 F600&#10;G90" @input="schedule()" />
          <span class="tm-hint">Klipper G-code and Jinja ({% if %}, {params.X}) exactly as in a [gcode_macro]. Checked before it's saved.</span>
        </div>
        <p v-if="madeByControls.length" class="tm-hint">Names your controls already use: {{ madeByControls.join(', ') }}</p>
      </template>

      <!-- ===== control ===== -->
      <template v-else>
        <div class="tm-row">
          <div class="tm-fld">
            <label for="ctl-name">{{ hardware ? 'Name' : 'Control name' }}</label>
            <input id="ctl-name" v-model="c.name" class="tm-in code" maxlength="32" :placeholder="hardware ? 'enclosure_light' : 'needle_vacuum'" @input="c.name = c.name.toLowerCase(); schedule()" />
            <span class="tm-hint">Lower-case letters, digits and _. Used in G-code, e.g. SET_PIN PIN={{ c.name || (hardware ? 'enclosure_light' : 'needle_vacuum') }}.</span>
          </div>
          <div class="tm-fld">
            <label for="ctl-purpose">What is it?</label>
            <input id="ctl-purpose" v-model="c.purpose" class="tm-in" maxlength="80" :placeholder="hardware ? 'Enclosure LED strip' : 'Vacuum pump relay'" @input="schedule()" />
          </div>
        </div>
        <div v-if="hardware" class="tm-row">
          <label class="tm-fld">
            <span class="tm-lbl">Category</span>
            <select v-model="c.category" class="tm-sel" @change="schedule(0)"><option v-for="x in options.hw_categories ?? []" :key="x.id" :value="x.id">{{ x.label }}</option></select>
            <span class="tm-hint">Edit the categories in Toolhead setup.</span>
          </label>
          <label class="tm-fld"><span class="tm-lbl">Notes (optional)</span><input v-model="c.notes" class="tm-in" maxlength="300" placeholder="24 V strip on the FAN5 header, 2 A" @input="schedule()" /></label>
        </div>

        <fieldset class="tm-set">
          <legend>1. Which way does the signal go?</legend>
          <label class="tm-radio" :class="{ on: c.dir === 'out' }"><input type="radio" :checked="c.dir === 'out'" @change="setDir('out')" /><span><strong>{{ hardware ? 'Rhino controls it' : 'Rhino controls something on the tool' }}</strong><br /><span class="tm-hint">A relay, fan, light, servo, driver…</span></span></label>
          <label class="tm-radio" :class="{ on: c.dir === 'in' }"><input type="radio" :checked="c.dir === 'in'" @change="setDir('in')" /><span><strong>{{ hardware ? 'It sends a signal to Rhino' : 'The tool sends a signal to Rhino' }}</strong><br /><span class="tm-hint">A button, door switch, limit switch, sensor…</span></span></label>
        </fieldset>

        <fieldset v-if="c.dir === 'out'" class="tm-set">
          <legend>2. What should Rhino do with it?</legend>
          <label v-for="r in roles" :key="r.value" class="tm-radio" :class="{ on: c.role === r.value }">
            <input type="radio" :checked="c.role === r.value" @change="c.role = r.value; schedule(0)" />
            <span><strong>{{ r.label }}</strong><br v-if="r.help" /><span v-if="r.help" class="tm-hint">{{ r.help }}</span></span>
          </label>
        </fieldset>

        <fieldset class="tm-set">
          <legend>{{ c.dir === 'out' ? 3 : 2 }}. {{ hardware ? 'Which board pin is it wired to?' : 'Which pin on the tool connector?' }}</legend>
          <div :class="hardware ? 'tm-row' : ''">
            <div class="tm-fld">
              <select v-model="c.pin" class="tm-sel" aria-label="Pin" @change="schedule(0)">
                <option value="">{{ pins.length ? 'Choose a pin…' : hardware ? 'No free board headers' : 'No free tool-connector pins' }}</option>
                <option v-for="p in pins" :key="p.pin" :value="p.pin" :disabled="p.bad">{{ p.label }}{{ p.bad ? ' - can’t do this' : '' }}</option>
              </select>
              <span class="tm-hint">{{ hardware ? 'Free headers on the board that are not on the umbilical.' : c.pin ? pinInfo.type_label : 'Only free pins wired to the umbilical are listed. Describe pins in myrhino/umbilical.json to filter by what they can do.' }}</span>
            </div>
            <label v-if="hardware" class="tm-fld">
              <span class="tm-lbl">Or type another pin or a label</span>
              <input v-model.lazy="typedPin" class="tm-in code" maxlength="32" placeholder="PE11 or ENCLOSURE_LIGHT" />
              <span class="tm-hint">Any free board pin, like one on the EXP headers, or a pin label. Checked against the whole config.</span>
            </label>
          </div>
          <!-- Scan Config (1.5.3): the pins and labels your config files define, to pick the one you set up -->
          <div v-if="hardware" class="scan">
            <RsButton size="sm" :disabled="scanning" @click="scanConfig">{{ scanning ? 'Scanning…' : 'Scan Config' }}</RsButton>
            <span class="tm-hint">Looks through printer.cfg and the files it includes for pin labels and the pins sections use.</span>
            <div v-if="scan" class="scanres">
              <p v-if="scan.error" class="tm-hint bad">{{ scan.error }}</p>
              <template v-else>
                <p class="sh">Pin labels{{ scan.labels.length ? '' : ': none yet (add them in Board pins and outputs)' }}</p>
                <ul v-if="scan.labels.length" class="sl">
                  <li v-for="l in scan.labels" :key="`${l.source}|${l.alias}`" :class="{ on: c.pin === l.alias }">
                    <span class="code strong">{{ l.alias }}</span>
                    <span class="code">{{ l.pin }}</span>
                    <span class="tm-hint">{{ l.block ?? (l.editable ? 'Rhino label, free' : `${l.source}, free`) }}</span>
                    <RsButton size="sm" :disabled="!!l.block || c.pin === l.alias" @click="pickLabel(l.alias)">{{ c.pin === l.alias ? 'Chosen' : 'Use' }}</RsButton>
                  </li>
                </ul>
                <p class="sh">Pins your config already uses</p>
                <ul class="sl used">
                  <li v-for="r in scan.raw" :key="`${r.file}|${r.section}|${r.key}`">
                    <span class="code strong">{{ r.pin }}</span>
                    <span class="code">{{ r.file }} [{{ r.section }}] {{ r.key }}</span>
                  </li>
                </ul>
                <p class="tm-hint">These are taken: a second section can't use the same pin. To move one of them here, give it a label in Board pins and outputs (Label it), then use the label above.</p>
              </template>
            </div>
          </div>
        </fieldset>

        <fieldset class="tm-set">
          <legend>{{ step }}. How does it behave?</legend>
          <template v-if="c.role === 'switch'">
            <label class="tm-check"><input v-model="c.invert" type="checkbox" @change="schedule(0)" /><span>On means the pin is pulled LOW (active-low)<br /><span class="tm-hint">Common on relay boards that switch when their input goes to ground.</span></span></label>
            <div class="tm-fld narrow">
              <label for="ctl-start">At power-up</label>
              <select id="ctl-start" v-model="c.start_on" class="tm-sel" @change="schedule(0)"><option :value="false">Off</option><option :value="true">On</option></select>
            </div>
          </template>
          <template v-if="c.role === 'level' || c.role === 'fan'">
            <div class="tm-row">
              <label class="tm-fld"><span class="tm-lbl">Maximum %</span><input v-model="c.max_pct" class="tm-in" type="number" min="5" max="100" @input="schedule()" /><span class="tm-hint">Ceiling for the _SET macro.</span></label>
              <label v-if="c.role === 'fan'" class="tm-fld"><span class="tm-lbl">Kick-start (s)</span><input v-model="c.kick_start" class="tm-in" type="number" step="any" @input="schedule()" /><span class="tm-hint">Full power this long to get it spinning.</span></label>
              <label class="tm-fld"><span class="tm-lbl">PWM cycle time (s)</span><input v-model="c.cycle" class="tm-in" type="number" step="any" @input="schedule()" /><span class="tm-hint">0.01 (100 Hz) for heaters and most drivers; 0.001 for LED dimmers; 0.00004 (25 kHz) for a 4-wire fan's speed wire.</span></label>
            </div>
            <label class="tm-check"><input v-model="c.invert" type="checkbox" @change="schedule(0)" /> Inverted output</label>
          </template>
          <template v-if="c.role === 'heater_fan'">
            <div class="tm-row">
              <label class="tm-fld"><span class="tm-lbl">Follows heater</span><select v-model="c.heater" class="tm-sel" @change="schedule(0)"><option v-for="h in options.heaters" :key="h" :value="h">{{ h }}</option></select></label>
              <label class="tm-fld"><span class="tm-lbl">On above (°C)</span><input v-model="c.heater_temp" class="tm-in" type="number" @input="schedule()" /></label>
              <label class="tm-fld"><span class="tm-lbl">Speed %</span><input v-model="c.max_pct" class="tm-in" type="number" min="5" max="100" @input="schedule()" /></label>
            </div>
            <p class="tm-hint">Klipper switches this fan by itself, so it gets no macros and isn't part of safe-off.</p>
          </template>
          <template v-if="c.role === 'servo'">
            <div class="tm-row">
              <label class="tm-fld"><span class="tm-lbl">Maximum angle (°)</span><input v-model="c.max_angle" class="tm-in" type="number" @input="schedule()" /></label>
              <label class="tm-fld"><span class="tm-lbl">Pulse at 0° (ms)</span><input v-model="c.min_ms" class="tm-in" type="number" step="0.05" @input="schedule()" /></label>
              <label class="tm-fld"><span class="tm-lbl">Pulse at max (ms)</span><input v-model="c.max_ms" class="tm-in" type="number" step="0.05" @input="schedule()" /></label>
            </div>
            <p class="tm-hint">Most hobby servos: 1.0 ms to 2.0 ms over 180°. Check the servo's data sheet.</p>
          </template>
          <template v-if="c.dir === 'in'">
            <span class="tm-lbl">What is connected?</span>
            <label class="tm-radio" :class="{ on: c.wiring === 'ground' }"><input type="radio" :checked="c.wiring === 'ground'" @change="c.wiring = 'ground'; schedule(0)" /><span><strong>A switch or button that connects the pin to ground</strong><br /><span class="tm-hint">The pin's pull-up is turned on, so it reads off until pressed.</span></span></label>
            <label class="tm-radio" :class="{ on: c.wiring === 'drive' }"><input type="radio" :checked="c.wiring === 'drive'" @change="c.wiring = 'drive'; schedule(0)" /><span><strong>A sensor or board that drives the line itself</strong><br /><span class="tm-hint">No pull-up.</span></span></label>
            <label class="tm-check"><input v-model="c.swap" type="checkbox" @change="schedule(0)" /><span>Swap pressed and released<br /><span class="tm-hint">If it reports the opposite of what you expect (normally-closed switches).</span></span></label>
            <div v-for="key in (['on_press', 'on_release'] as const)" :key="key" class="tm-row">
              <label class="tm-fld">
                <span class="tm-lbl">{{ key === 'on_press' ? 'When it triggers' : 'When it is released' }}</span>
                <select v-model="c[key]!.action" class="tm-sel" @change="schedule(0)"><option v-for="[k, l] in actions(key)" :key="k" :value="k">{{ l }}</option></select>
              </label>
              <label v-if="c[key]!.action === 'message'" class="tm-fld"><span class="tm-lbl">Message</span><input v-model="c[key]!.message" class="tm-in" maxlength="80" :placeholder="`${c.name || 'lid'} opened`" @input="schedule()" /></label>
              <label v-if="c[key]!.action === 'command'" class="tm-fld"><span class="tm-lbl">Command</span><input v-model="c[key]!.command" class="tm-in code" maxlength="80" placeholder="NEEDLE_VACUUM_OFF" @input="schedule()" /></label>
            </div>
          </template>
        </fieldset>

        <fieldset v-if="c.dir === 'out' && c.role !== 'heater_fan'" class="tm-set">
          <legend>{{ step + 1 }}. Safety and shortcuts</legend>
          <label class="tm-check"><input v-model="c.safe_off" type="checkbox" @change="schedule(0)" /><span>Switch it off whenever the machine is made safe<br /><span class="tm-hint">{{ hardware ? 'End of job, cancel, tool swap and emergency stop (_TOOL_SAFE_OFF). Leave it off for lights and cooling that should stay on.' : 'Cancel, tool swap and emergency stop (_TOOL_SAFE_OFF).' }}</span></span></label>
          <span class="tm-lbl">If Klipper shuts down or loses the board</span>
          <label class="tm-radio" :class="{ on: c.on_shutdown === 'off' }"><input type="radio" :checked="c.on_shutdown === 'off'" @change="c.on_shutdown = 'off'; schedule(0)" /><strong>Switch it off (recommended)</strong></label>
          <label class="tm-radio" :class="{ on: c.on_shutdown === 'on' }"><input type="radio" :checked="c.on_shutdown === 'on'" @change="c.on_shutdown = 'on'; schedule(0)" /><span><strong>Leave it on</strong><br /><span class="tm-hint">Only for things that are safe left running, such as cooling.</span></span></label>
          <label class="tm-check"><input v-model="c.make_macros" type="checkbox" @change="schedule(0)" /><span>Make macros for it: {{ genNames.join(', ') }}<br /><span class="tm-hint">Use them in job files or the console.</span></span></label>
          <label v-if="c.make_macros && !hardware" class="tm-check"><input v-model="c.mounted_only" type="checkbox" @change="schedule(0)" /><span>Those macros only switch it on while this tool is mounted<br /><span class="tm-hint">Switching it off always works.</span></span></label>
        </fieldset>
      </template>

      <div class="tm-fld">
        <span class="tm-lbl">Written to custom_tools.cfg</span>
        <pre class="tm-pre" :class="{ bad: last && !last.ok }" aria-live="polite">{{ !last ? 'Checking…' : last.ok ? last.text : `Nothing is written until this is fixed:\n\n${last.error}` }}</pre>
        <div v-for="(w, i) in last?.warnings ?? []" :key="i" class="tm-warn">{{ w }}</div>
      </div>

      <p v-if="saveError" class="tm-err" role="alert">{{ saveError }}</p>
      <footer class="tm-actions foot">
        <template v-if="hardware">
          <RsButton type="submit" variant="primary" :disabled="(!!last && !last.ok) || saving">{{ saving ? 'Saving…' : isNew ? 'Add hardware' : 'Save' }}</RsButton>
          <RsButton @click="emit('close')">Cancel</RsButton>
          <span class="tm-hint">Live after the next Klipper restart.</span>
          <span class="grow" />
          <RsButton v-if="!isNew" variant="danger-outline" @click="emit('remove')">Remove hardware</RsButton>
        </template>
        <template v-else>
          <RsButton type="submit" variant="primary" :disabled="!!last && !last.ok">{{ isNew ? `Add ${kind}` : 'Keep changes' }}</RsButton>
          <RsButton @click="emit('close')">Cancel</RsButton>
          <span class="tm-hint">Saved with the tool.</span>
        </template>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.scan { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: var(--rs-space-3); }
.scanres { flex-basis: 100%; padding: 10px 12px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface-2); }
.scanres .sh { margin: 6px 0 4px; font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.sl { list-style: none; margin: 0 0 6px; padding: 0; max-height: 200px; overflow: auto; }
.sl li { display: grid; grid-template-columns: minmax(120px, 1fr) 60px minmax(0, 1.4fr) auto; align-items: center; gap: 10px; padding: 5px 0; border-top: 1px solid var(--rs-line); font-size: var(--rs-text-sm); }
.sl li:first-child { border-top: 0; }
.sl li.on .strong { text-decoration: underline; text-underline-offset: 3px; }
.sl.used li { grid-template-columns: 60px minmax(0, 1fr); color: var(--rs-text-muted); }
.sl .code { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); overflow-wrap: anywhere; }
.sl .strong { color: var(--rs-text-strong); font-weight: 600; }
.bad { color: var(--rs-danger); }
.dlg {
  width: min(720px, calc(100vw - 24px)); max-height: calc(100vh - 32px); padding: 0;
  border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text);
}
.dlg::backdrop { background: rgb(0 0 0 / 0.45); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); padding: var(--rs-space-5) var(--rs-space-5) var(--rs-space-4); }
h2 { margin: 0; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.narrow { max-width: 200px; }
.grow { flex: 1; }
.foot { position: sticky; bottom: calc(-1 * var(--rs-space-4)); padding: var(--rs-space-3) 0; background: var(--rs-surface); border-top: 1px solid var(--rs-line); }
</style>
