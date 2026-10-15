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
import { controlPins, ctlMacroNames, draftToControl, type ControlDraft } from './form'
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
}>()
const emit = defineEmits<{ close: []; save: [item: ToolControl | ToolMacro] }>()

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
    const r = await tm.client().preview(props.kind, body)
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
  if (last.value?.ok && last.value.item) emit('save', last.value.item)
}

// ---- control choices
const roles = computed(() => props.options.control_roles.filter((r) => r.value !== 'input' && (r.value !== 'heater_fan' || props.options.heaters.length)))
const pins = computed(() => (props.kind === 'control' ? controlPins(props.options, c.value.dir === 'in' ? 'input' : c.value.role, props.pinsTaken, props.pinsMine) : []))
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
      <h2 id="item-title">{{ isNew ? 'New' : 'Edit' }} {{ kind }} · {{ toolName }}</h2>

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
            <label for="ctl-name">Control name</label>
            <input id="ctl-name" v-model="c.name" class="tm-in code" maxlength="32" placeholder="needle_vacuum" @input="c.name = c.name.toLowerCase(); schedule()" />
            <span class="tm-hint">Lower-case letters, digits and _. Used in G-code, e.g. SET_PIN PIN={{ c.name || 'needle_vacuum' }}.</span>
          </div>
          <div class="tm-fld">
            <label for="ctl-purpose">What is it?</label>
            <input id="ctl-purpose" v-model="c.purpose" class="tm-in" maxlength="80" placeholder="Vacuum pump relay" @input="schedule()" />
          </div>
        </div>

        <fieldset class="tm-set">
          <legend>1. Which way does the signal go?</legend>
          <label class="tm-radio" :class="{ on: c.dir === 'out' }"><input type="radio" :checked="c.dir === 'out'" @change="setDir('out')" /><span><strong>Rhino controls something on the tool</strong><br /><span class="tm-hint">A relay, fan, light, servo, driver…</span></span></label>
          <label class="tm-radio" :class="{ on: c.dir === 'in' }"><input type="radio" :checked="c.dir === 'in'" @change="setDir('in')" /><span><strong>The tool sends a signal to Rhino</strong><br /><span class="tm-hint">A button, door switch, limit switch, sensor…</span></span></label>
        </fieldset>

        <fieldset v-if="c.dir === 'out'" class="tm-set">
          <legend>2. What should Rhino do with it?</legend>
          <label v-for="r in roles" :key="r.value" class="tm-radio" :class="{ on: c.role === r.value }">
            <input type="radio" :checked="c.role === r.value" @change="c.role = r.value; schedule(0)" />
            <span><strong>{{ r.label }}</strong><br v-if="r.help" /><span v-if="r.help" class="tm-hint">{{ r.help }}</span></span>
          </label>
        </fieldset>

        <fieldset class="tm-set">
          <legend>{{ c.dir === 'out' ? 3 : 2 }}. Which pin on the tool connector?</legend>
          <div class="tm-fld">
            <select v-model="c.pin" class="tm-sel" aria-label="Pin" @change="schedule(0)">
              <option value="">{{ pins.length ? 'Choose a pin…' : 'No free tool-connector pins' }}</option>
              <option v-for="p in pins" :key="p.pin" :value="p.pin" :disabled="p.bad">{{ p.label }}{{ p.bad ? ' - can’t do this' : '' }}</option>
            </select>
            <span class="tm-hint">{{ c.pin ? pinInfo.type_label : 'Only free pins wired to the umbilical are listed. Describe pins in myrhino/umbilical.json to filter by what they can do.' }}</span>
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
              <label class="tm-fld"><span class="tm-lbl">PWM cycle time (s)</span><input v-model="c.cycle" class="tm-in" type="number" step="any" @input="schedule()" /><span class="tm-hint">0.01 (100 Hz) for heaters and most drivers; 0.001 for LED dimmers.</span></label>
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
          <label class="tm-check"><input v-model="c.safe_off" type="checkbox" @change="schedule(0)" /><span>Switch it off whenever the machine is made safe<br /><span class="tm-hint">Cancel, tool swap and emergency stop (_TOOL_SAFE_OFF).</span></span></label>
          <span class="tm-lbl">If Klipper shuts down or loses the board</span>
          <label class="tm-radio" :class="{ on: c.on_shutdown === 'off' }"><input type="radio" :checked="c.on_shutdown === 'off'" @change="c.on_shutdown = 'off'; schedule(0)" /><strong>Switch it off (recommended)</strong></label>
          <label class="tm-radio" :class="{ on: c.on_shutdown === 'on' }"><input type="radio" :checked="c.on_shutdown === 'on'" @change="c.on_shutdown = 'on'; schedule(0)" /><span><strong>Leave it on</strong><br /><span class="tm-hint">Only for things that are safe left running, such as cooling.</span></span></label>
          <label class="tm-check"><input v-model="c.make_macros" type="checkbox" @change="schedule(0)" /><span>Make macros for it: {{ genNames.join(', ') }}<br /><span class="tm-hint">Use them in job files or the console.</span></span></label>
          <label v-if="c.make_macros" class="tm-check"><input v-model="c.mounted_only" type="checkbox" @change="schedule(0)" /><span>Those macros only switch it on while this tool is mounted<br /><span class="tm-hint">Switching it off always works.</span></span></label>
        </fieldset>
      </template>

      <div class="tm-fld">
        <span class="tm-lbl">Written to custom_tools.cfg</span>
        <pre class="tm-pre" :class="{ bad: last && !last.ok }" aria-live="polite">{{ !last ? 'Checking…' : last.ok ? last.text : `Nothing is written until this is fixed:\n\n${last.error}` }}</pre>
        <div v-for="(w, i) in last?.warnings ?? []" :key="i" class="tm-warn">{{ w }}</div>
      </div>

      <footer class="tm-actions foot">
        <RsButton type="submit" variant="primary" :disabled="!!last && !last.ok">{{ isNew ? `Add ${kind}` : 'Keep changes' }}</RsButton>
        <RsButton @click="emit('close')">Cancel</RsButton>
        <span class="tm-hint">Saved with the tool.</span>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(720px, calc(100vw - 24px)); max-height: calc(100vh - 32px); padding: 0;
  border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text);
}
.dlg::backdrop { background: rgb(0 0 0 / 0.45); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); padding: var(--rs-space-5) var(--rs-space-5) var(--rs-space-4); }
h2 { margin: 0; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.narrow { max-width: 200px; }
.foot { position: sticky; bottom: calc(-1 * var(--rs-space-4)); padding: var(--rs-space-3) 0; background: var(--rs-surface); border-top: 1px solid var(--rs-line); }
</style>
