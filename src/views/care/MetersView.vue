<script setup lang="ts">
/**
 * Usage meters: what the Portal counts from Klipper and Moonraker (hours,
 * jobs, filament, swaps), for the machine and for each toolhead. Usage rules
 * count these. Set one by hand if the machine had hours before tracking
 * started. Also the Mainsail reminder switch.
 */
import { computed, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { lookFor } from '@/toolheads/registry'
import MeterDialog from '@/maintenance/MeterDialog.vue'
import { fmtMeter } from '@/maintenance/summary'
import type { MeterRow } from '@/maintenance/types'
import { useMaintenanceStore } from '@/stores/maintenance'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const care = useMaintenanceStore()
const mm = computed(() => care.overview?.meters ?? null)
const tools = computed(() => Object.entries(mm.value?.tools ?? {}))
const shut = ref<Record<string, boolean>>({})
const isOpen = (name: string) => shut.value[name] === false
const setting = ref<{ m: MeterRow; tool: string | null } | null>(null)

const flash = ref<string | null>(null)
function say(m: string) {
  flash.value = m
  setTimeout(() => (flash.value = null), 5000)
}
const num = (m: MeterRow) => String(Math.round(m.value))
const rate = (m: MeterRow) => (m.per_day ? `About ${fmtMeter(m.per_day, m.unit)} a day` : 'Not enough use yet for an average')
const fmtDay = (s: number) => new Date(s * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const brief = (rows: MeterRow[]) => rows.filter((r) => r.unit === 'h').slice(0, 2).map((r) => `${r.label.toLowerCase()} ${fmtMeter(r.value, r.unit)}`).join(' · ')

const saving = ref(false)
async function setReminder(on: boolean) {
  saving.value = true
  try {
    await care.write((c) => c.careSettings({ boot_reminder: on }))
    say(on ? 'Mainsail reminder on' : 'Mainsail reminder off')
  } catch (e) {
    say((e as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Usage meters</h1>
        <p>
          What the Portal counts from Klipper and Moonraker. “After so much use” rules count these.
          <template v-if="mm?.tracking_since">Tracking since {{ fmtDay(mm.tracking_since) }}<template v-if="mm.imported_jobs">, with {{ mm.imported_jobs }} earlier jobs imported from Moonraker's history</template>.</template>
        </p>
      </div>
    </div>
    <p v-if="flash" class="sx-flash" role="status">{{ flash }}</p>
    <p v-if="!mm" class="muted">{{ care.source === 'unavailable' ? `Can't reach the Rhino Portal: ${care.error}` : 'Loading meters…' }}</p>

    <template v-else>
      <div class="tiles">
        <div v-for="m in mm.machine" :key="m.meter" class="tile">
          <span class="lbl">{{ m.label }}</span>
          <span class="val rs-num">{{ num(m) }}<small v-if="m.unit">{{ m.unit }}</small></span>
          <span class="det">{{ rate(m) }}</span>
          <button type="button" class="sx-link set" :aria-label="`Set ${m.label}`" @click="setting = { m, tool: null }">Set</button>
        </div>
      </div>

      <section v-for="[name, rows] in tools" :key="name" class="sx-fold" :class="{ open: isOpen(name) }">
        <button type="button" class="fh" :aria-expanded="isOpen(name)" @click="shut = { ...shut, [name]: !isOpen(name) ? false : true }">
          <span class="sx-chev" />
          <ToolheadBadge :look="lookFor(name)" size="sm" />
          <span class="fr fm">{{ brief(rows) }}</span>
        </button>
        <div v-show="isOpen(name)" class="fb">
          <ul class="sx-rows">
            <li v-for="m in rows" :key="m.meter" class="mrow">
              <span class="ml"><strong>{{ m.label }}</strong><span class="tm-hint">{{ m.help }}</span></span>
              <span class="mv">{{ fmtMeter(m.value, m.unit) }}</span>
              <span class="mr">{{ m.per_day ? `${fmtMeter(m.per_day, m.unit)} / day` : '—' }}</span>
              <RsButton size="sm" variant="quiet" @click="setting = { m, tool: name }">Set</RsButton>
            </li>
          </ul>
        </div>
      </section>

      <section class="card">
        <h2>Reminders</h2>
        <label class="tm-check">
          <input type="checkbox" :checked="!!care.overview?.settings?.boot_reminder" :disabled="saving" @change="setReminder(($event.target as HTMLInputElement).checked)" />
          <span>Show overdue and due-soon tasks in Mainsail after Klipper starts<br /><span class="tm-hint">Once per start, after the “which tool is mounted?” question. It never blocks a job. PM_STATUS in the console lists them any time. A status code can leave its tasks out (Care setup → Status codes).</span></span>
        </label>
      </section>
    </template>

    <MeterDialog :meter="setting?.m ?? null" :tool="setting?.tool ?? null" @close="setting = null" @saved="say" />
  </div>
</template>

<style scoped>
.tiles { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.tile { position: relative; display: flex; flex-direction: column; gap: 4px; padding: var(--rs-space-3) var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); min-width: 0; }
.lbl { font-size: var(--rs-text-xs); line-height: 18px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 32px; }
.val { font-size: 2.4rem; line-height: 0.9; margin-top: 6px; white-space: nowrap; }
.val small { font-family: var(--rs-font-ui); font-size: 0.4em; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); margin-left: -0.04em; vertical-align: top; }
.det { font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.set { position: absolute; top: var(--rs-space-3); right: var(--rs-space-4); font-size: var(--rs-text-xs); }
.mrow { display: grid; grid-template-columns: minmax(0, 1fr) 110px 110px auto; gap: var(--rs-space-4); align-items: center; padding: var(--rs-space-3) 0; font-size: var(--rs-text-sm); }
.ml { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ml strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.mv { font-family: var(--rs-font-code); color: var(--rs-text-strong); text-align: right; }
.mr { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-text-muted); text-align: right; }
.card { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-4) var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); margin-top: var(--rs-space-3); }
.card h2 { margin: 0; font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
@media (max-width: 640px) {
  .mrow { grid-template-columns: minmax(0, 1fr) auto; }
  .mr { display: none; }
  .mrow .mv { grid-column: 2; }
}
</style>
