<script setup lang="ts">
/**
 * The 21-contact tool connector as the Rhino is wired now: what each contact
 * carries, which board pin drives it, and which toolheads use it. Pick a
 * toolhead to see only its contacts; pick a contact for its details.
 * Read-only: wiring is described in myrhino/umbilical.json on the Pi.
 */
import { computed, ref } from 'vue'
import ToolConnector from '@/toolmgr/ToolConnector.vue'
import { useToolMgrStore } from '@/stores/toolmgr'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const tm = useToolMgrStore()
const contacts = computed(() => tm.pins?.contacts ?? [])
const tool = ref('')
const sel = ref<number | null>(null)
const KIND: Record<string, string> = { switched: 'Switched output', signal: 'Signal', return: 'Return / −', supply: 'Supply +', stepper: 'Stepper', spare: 'Spare' }

const shown = computed(() =>
  contacts.value.map((c) => ({
    contact: c.contact,
    label: c.label,
    pin: c.pin,
    use: (c.tools ?? []).join(', '),
    used: tool.value ? (c.tools ?? []).includes(tool.value) : (c.tools ?? []).length > 0,
  })),
)
const picked = computed(() => contacts.value.find((c) => c.contact === sel.value) ?? null)
const rows = computed(() => (tool.value ? contacts.value.filter((c) => (c.tools ?? []).includes(tool.value)) : contacts.value))
const free = computed(() => contacts.value.filter((c) => !(c.tools ?? []).length).length)
const warnings = computed(() => contacts.value.filter((c) => c.warning))
const pick = (n: number) => (sel.value = sel.value === n ? null : n)
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Tool connector</h1>
        <p>The 21-contact connector every toolhead docks onto: what each contact carries, the board pin behind it, and which toolheads use it. {{ free }} contact{{ free === 1 ? ' is' : 's are' }} not used by any tool.</p>
      </div>
    </div>

    <p v-if="!tm.pins" class="muted">{{ tm.error ? `Can't reach the Rhino Portal: ${tm.error}` : 'Loading…' }}</p>
    <template v-else>
      <p v-for="w in warnings" :key="w.contact" class="tm-warn">Contact {{ w.contact }} ({{ w.label }}): {{ w.warning }}</p>
      <p v-if="tm.pins.missing_includes.length" class="tm-err">printer.cfg is missing include files: {{ tm.pins.missing_includes.join(', ') }}</p>

      <div class="sx-bar">
        <span class="tm-lbl">Show</span>
        <div class="sx-seg" role="group" aria-label="Show contacts for">
          <button type="button" :class="{ on: !tool }" :aria-pressed="!tool" @click="tool = ''">Every tool</button>
          <button v-for="t in tm.tools" :key="t.name" type="button" :class="{ on: tool === t.name }" :aria-pressed="tool === t.name" @click="tool = t.name">{{ t.name }}</button>
        </div>
      </div>

      <div class="top">
        <section class="card fig">
          <ToolConnector :contacts="shown" :selected="sel" @pick="pick" />
          <p class="tm-hint">Filled: {{ tool ? `used by ${tool}` : 'used by at least one toolhead' }}. Select a contact for its details.</p>
        </section>
        <section class="card det">
          <template v-if="picked">
            <span class="tm-lbl">Contact {{ picked.contact }}</span>
            <h2>{{ picked.label }}</h2>
            <dl>
              <dt>Kind</dt><dd>{{ KIND[picked.kind ?? ''] ?? picked.kind }}</dd>
              <dt>Board pin</dt><dd class="mono">{{ picked.pin || '—' }}</dd>
              <dt>Driven by</dt><dd class="mono">{{ picked.output || picked.used_by || picked.owner || '—' }}</dd>
              <dt>Toolheads</dt><dd>{{ (picked.tools ?? []).join(', ') || 'None' }}</dd>
            </dl>
            <p v-if="picked.warning" class="tm-warn">{{ picked.warning }}</p>
          </template>
          <p v-else class="tm-hint">Nothing selected. Each contact's use is also in the table below.</p>
        </section>
      </div>

      <section class="card">
        <div class="sx-colhead cols"><span>Contact</span><span>Carries</span><span>Board pin</span><span>Driven by</span><span>Toolheads</span></div>
        <ul class="sx-rows">
          <li v-for="c in rows" :key="c.contact" class="row cols" :class="{ sel: sel === c.contact, warn: c.warning }" @click="pick(c.contact)">
            <span class="no" :class="{ on: (c.tools ?? []).length }">{{ c.contact }}</span>
            <span><span class="strong">{{ c.label }}</span><br /><span class="tm-hint">{{ KIND[c.kind ?? ''] ?? c.kind }}</span></span>
            <span class="mono">{{ c.pin || '—' }}</span>
            <span class="mono sm">{{ c.output || c.used_by || c.owner || '—' }}<span v-if="c.warning" class="tm-hint wl"><br />{{ c.warning }}</span></span>
            <span class="sm">{{ (c.tools ?? []).join(', ') || '—' }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.top { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(240px, 1fr); gap: var(--rs-gap); align-items: stretch; }
.card { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-4) var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); min-width: 0; }
.fig { align-items: center; justify-content: center; }
.det h2 { margin: 0; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.det dl { display: grid; grid-template-columns: auto 1fr; gap: 6px var(--rs-space-4); margin: 0; font-size: var(--rs-text-sm); }
.det dt { color: var(--rs-text-muted); }
.det dd { margin: 0; color: var(--rs-text-strong); overflow-wrap: anywhere; }
.cols { grid-template-columns: 60px minmax(160px, 1.4fr) 90px minmax(140px, 1.4fr) minmax(140px, 1.2fr); align-items: start; }
.row { display: grid; gap: var(--rs-space-4); padding: var(--rs-space-2) var(--rs-space-2); cursor: pointer; border-radius: var(--rs-radius-sm); font-size: var(--rs-text-sm); }
.row:hover { background: var(--rs-surface-2); }
.row.sel { box-shadow: inset 3px 0 0 var(--rs-ink); background: var(--rs-surface-2); }
.no { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; border: 1.4px solid var(--rs-text-muted); font-size: 12px; font-weight: var(--rs-weight-bold); color: var(--rs-text-muted); }
.no.on { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.strong { color: var(--rs-text-strong); }
.mono { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-text-strong); }
.sm { font-size: var(--rs-text-xs); }
.wl { font-family: var(--rs-font-ui); }
@media (max-width: 900px) {
  .top { grid-template-columns: minmax(0, 1fr); }
  .sx-colhead { display: none; }
  .cols { grid-template-columns: 40px 1fr 1fr; }
  .cols > :nth-child(4), .cols > :nth-child(5) { grid-column: 2 / span 2; }
}
</style>
