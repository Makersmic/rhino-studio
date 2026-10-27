<script setup lang="ts">
/**
 * System hardware: things wired to the board rather than the tool connector
 * (enclosure fans and lights, an air pump, a door switch), grouped by
 * category. Add and edit with the same form as a tool's controls; the Portal
 * checks each against the whole config and writes custom_tools.cfg, live
 * after the next Klipper restart. Each piece can have its own care tasks.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import ItemDialog from '@/toolmgr/ItemDialog.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import { controlToDraft, describeControl, newHardware, roleLabel, type ControlDraft } from '@/toolmgr/form'
import type { SystemHardware, ToolControl } from '@/toolmgr/types'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useToolMgrStore } from '@/stores/toolmgr'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const tm = useToolMgrStore()
const router = useRouter()
const care = useMaintenanceStore()
const control = useControlStore()
const error = ref<string | null>(null)
onMounted(() => tm.loadOptions().catch((e) => (error.value = (e as Error).message)))

const list = computed(() => tm.pins?.hardware ?? [])

// Hardware added with the Add hardware wizard (Tool Manager 1.9): listed here, removed here, added and edited in the wizard
type WizardItem = { name: string; device: string; label: string; purpose?: string; pins: Record<string, string>; headers?: Record<string, string>; macros?: string[]; live?: boolean }
const wizardItems = ref<WizardItem[]>([])
const wizardOk = ref(false)
async function loadWizard() {
  try {
    wizardItems.value = (await tm.client().hwDevices()).devices as unknown as WizardItem[]
    wizardOk.value = true
  } catch {
    wizardOk.value = false // an older Tool Manager: the wizard isn't there yet
  }
}
onMounted(loadWizard)
const pinsOf = (x: WizardItem) => Object.entries(x.pins).map(([k, p]) => `${p}${x.headers?.[k] ? ` · ${x.headers[k]}` : ''}`).join(', ')
async function removeWizard(x: WizardItem) {
  const ok = await control.confirm({
    title: `Remove ${x.name}?`,
    body: 'Its section is taken out of custom_tools.cfg at the next Klipper restart.',
    feature: x.name,
    confirmLabel: `Remove ${x.name}`,
    tone: 'danger',
  })
  if (!ok) return
  try {
    await tm.client().deleteDevice(x.name)
    await tm.changed()
    await loadWizard()
    say(`${x.name} removed. Restart Klipper to apply.`)
  } catch (e) {
    error.value = (e as Error).message
  }
}
const groups = computed(() => {
  const out: { label: string; items: SystemHardware[] }[] = []
  for (const x of list.value) {
    const label = x.category_label || 'Other'
    const g = out.find((o) => o.label === label)
    if (g) g.items.push(x)
    else out.push({ label, items: [x] })
  }
  return out
})
const careOf = (name: string) => (care.overview?.tasks ?? []).filter((t) => t.asset === `hw:${name}` && !t.archived)
const dueOf = (name: string) => careOf(name).filter((t) => t.status && (t.status.state === 'overdue' || t.status.state === 'due_soon')).length

const editing = ref<ControlDraft | null>(null)
const mine = computed(() => (editing.value?.original ? [editing.value.pin] : []))
async function open(x: SystemHardware | null) {
  error.value = null
  try {
    const o = await tm.loadOptions()
    editing.value = x ? { ...controlToDraft(x as ToolControl), category: x.category, notes: x.notes ?? '' } : newHardware(o)
  } catch (e) {
    error.value = (e as Error).message
  }
}

const flash = ref<string | null>(null)
function say(m: string) {
  flash.value = m
  setTimeout(() => (flash.value = null), 6000)
}
async function submit(item: ToolControl) {
  const r = await tm.client().saveHardware(item)
  editing.value = null
  await tm.changed()
  say(`${r.name ?? item.name} saved.${r.restart_needed ? ' Restart Klipper to make it live.' : ''}`)
}
async function remove() {
  const name = editing.value?.original
  if (!name) return
  const ok = await control.confirm({
    title: `Remove ${name}?`,
    body: 'Its section is taken out of custom_tools.cfg at the next Klipper restart. Its care tasks are archived; the work log keeps their history.',
    feature: name,
    confirmLabel: `Remove ${name}`,
    tone: 'danger',
  })
  if (!ok) return
  try {
    await tm.client().deleteHardware(name)
    editing.value = null
    await tm.changed()
    say(`${name} removed. Restart Klipper to apply.`)
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>System hardware</h1>
        <p>Things wired to the board rather than the tool connector: enclosure fans and lights, an air or vacuum pump, a door switch. They're there whichever tool is mounted, and each can have its own care tasks.</p>
      </div>
      <div class="acts">
        <RouterLink v-if="wizardOk" class="sx-link" to="/assets/hardware/new">Add hardware (wizard)</RouterLink>
        <RsButton variant="primary" :disabled="!tm.state" @click="open(null)">Add system hardware</RsButton>
      </div>
    </div>

    <RestartBanner />
    <p v-if="flash" class="sx-flash" role="status">{{ flash }}</p>
    <p v-if="error" class="tm-err" role="alert">{{ error }}</p>
    <p v-if="!tm.state" class="muted">{{ tm.error ? `Can't reach the Rhino Portal: ${tm.error}` : 'Loading…' }}</p>

    <div v-else-if="!list.length && !wizardItems.length" class="sx-empty">
      <strong>No system hardware yet.</strong>
      <span>Add anything on a spare board header: the Portal finds a free pin, writes the Klipper section and its on/off macros, and checks it against the whole config first.</span>
      <RsButton @click="open(null)">Add system hardware</RsButton>
    </div>

    <template v-for="g in groups" :key="g.label">
      <h2 class="gh"><span>{{ g.label }}</span><span class="sx-count">{{ g.items.length }}</span><span class="rs-rule leader" /></h2>
      <div class="cards">
        <article v-for="x in g.items" :key="x.name" class="hw">
          <header class="top">
            <span class="name">{{ x.name }}</span>
            <span class="sx-tag plain pin">{{ x.pin }}{{ x.header ? ` · ${x.header}` : '' }}</span>
          </header>
          <p class="purpose">{{ x.purpose || roleLabel(x.role) }}</p>
          <p class="tm-hint">{{ describeControl({ ...x, make_macros: false }, tm.options?.input_actions ?? []) }}</p>
          <div v-if="x.macros.length" class="sx-tags"><span v-for="m in x.macros" :key="m" class="sx-tag plain mono">{{ m }}</span></div>
          <p v-if="x.notes" class="note">{{ x.notes }}</p>
          <footer class="tm-actions">
            <RsButton size="sm" @click="open(x)">Edit</RsButton>
            <RouterLink class="sx-link" :to="{ path: '/care/tasks', query: { for: `hw:${x.name}` } }">Care tasks{{ careOf(x.name).length ? ` (${careOf(x.name).length})` : '' }}</RouterLink>
            <span v-if="dueOf(x.name)" class="sx-count strong" :title="`${dueOf(x.name)} due`">{{ dueOf(x.name) }}</span>
          </footer>
        </article>
      </div>
    </template>

    <template v-if="wizardItems.length">
      <h2 class="gh"><span>Added with the wizard</span><span class="sx-count">{{ wizardItems.length }}</span><span class="rs-rule leader" /></h2>
      <div class="cards">
        <article v-for="x in wizardItems" :key="x.name" class="hw">
          <header class="top">
            <span class="name">{{ x.name }}</span>
            <span class="sx-tag plain pin">{{ pinsOf(x) || 'no pin' }}</span>
          </header>
          <p class="purpose">{{ x.purpose || x.label }}</p>
          <p v-if="x.purpose" class="tm-hint">{{ x.label }}{{ x.live ? ' · behind the padlock' : '' }}</p>
          <div v-if="x.macros?.length" class="sx-tags"><span v-for="m in x.macros" :key="m" class="sx-tag plain mono">{{ m }}</span></div>
          <footer class="tm-actions">
            <RsButton size="sm" @click="router.push(`/assets/hardware/${encodeURIComponent(x.name)}/edit`)">Edit</RsButton>
            <RsButton size="sm" variant="danger-outline" @click="removeWizard(x)">Remove</RsButton>
            <RouterLink class="sx-link" :to="{ path: '/care/tasks', query: { for: `hw:${x.name}` } }">Care tasks{{ careOf(x.name).length ? ` (${careOf(x.name).length})` : '' }}</RouterLink>
          </footer>
        </article>
      </div>
    </template>

    <ItemDialog
      v-if="tm.options"
      kind="control"
      hardware
      :item="editing"
      :others="[]"
      :ctx="{}"
      tool-name="system hardware"
      :options="tm.options"
      :pins-taken="[]"
      :pins-mine="mine"
      :submit="submit"
      @close="editing = null"
      @remove="remove"
    />
  </div>
</template>

<style scoped>
.gh { display: flex; align-items: center; gap: var(--rs-space-3); margin: var(--rs-space-3) 0 0; padding: 0 var(--rs-space-1); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.leader { flex: 1; }
.cards { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); align-items: start; }
.hw { display: flex; flex-direction: column; gap: var(--rs-space-2); padding: var(--rs-space-4) var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); min-width: 0; }
.top { display: flex; align-items: center; justify-content: space-between; gap: var(--rs-space-3); }
.name { font-family: var(--rs-font-code); font-size: var(--rs-text-md); color: var(--rs-text-strong); font-weight: 600; overflow-wrap: anywhere; }
.pin { font-family: var(--rs-font-code); }
.purpose { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.mono { font-family: var(--rs-font-code); font-size: 11px; }
.note { margin: 0; padding: 8px 10px; border-radius: var(--rs-radius-md); background: var(--rs-dither-faint), var(--rs-bg); font-size: var(--rs-text-sm); }
.hw footer { margin-top: var(--rs-space-2); }
</style>
