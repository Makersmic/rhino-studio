<script setup lang="ts">
/**
 * Preventive maintenance for the machine and every toolhead.
 * Data and rules come from the Rhino Portal; this screen shows them in
 * Studio's terms and lets you log work and snooze.
 */
import { computed, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import Readout from '@/components/Readout.vue'
import RsPanel from '@/components/RsPanel.vue'
import SectionRule from '@/components/SectionRule.vue'
import Icon from '@/icons/Icon.vue'
import AssetCareTile from '@/maintenance/AssetCareTile.vue'
import CareTaskCard from '@/maintenance/CareTaskCard.vue'
import LogWorkDialog from '@/maintenance/LogWorkDialog.vue'
import { fmtMeter } from '@/maintenance/summary'
import type { MaintTask } from '@/maintenance/types'
import { lookFor } from '@/toolheads/registry'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'

const care = useMaintenanceStore()
const machine = useMachineStore()

const logging = ref<MaintTask | null>(null)
const busy = ref<string | null>(null)
const notice = ref<string | null>(null)

function flash(msg: string) {
  notice.value = msg
  setTimeout(() => (notice.value = null), 5000)
}

async function snooze(t: MaintTask) {
  busy.value = t.id
  try {
    await care.snooze(t.id, 7)
    flash(`Snoozed for 7 days: ${t.title}`)
  } catch (e) {
    flash(`Couldn't snooze: ${(e as Error).message}`)
  } finally {
    busy.value = null
  }
}

const tools = computed(() => {
  const names = care.overview?.tools?.map((t) => t.name) ?? machine.knownTools.map((t) => t.name)
  return names.map((name) => ({ name, look: lookFor(name, care.overview?.tools?.find((t) => t.name === name)?.type), care: care.forTool(name)! }))
})

const meter = (key: string) => care.overview?.meters.machine.find((m) => m.meter === key) ?? null
const prodH = computed(() => meter('prod_h'))
const machineMeters = computed(() => care.overview?.meters.machine ?? [])

const ACTION: Record<string, string> = { done: 'Done', skipped: 'Skipped', status: 'Status set', status_cleared: 'Status cleared', meter: 'Meter set' }
const fmtDay = (s: number) => new Date(s * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const log = computed(() => care.history.slice(0, 15))
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Care</h1>
      <p>
        Preventive maintenance for the Rhino and every toolhead, counted from real use.
        Schedules and the work log live in the Rhino Portal<template v-if="care.portalVersion"> (v{{ care.portalVersion }})</template>;
        add or edit tasks and Task Books
        <a v-if="care.portalHome" :href="care.portalHome" target="_blank" rel="noopener">in the Portal</a><template v-else>in the Portal</template>
        until Phase 5 brings that here.
      </p>
    </div>

    <EmptyState v-if="care.source === 'unavailable'" title="Can't reach the Rhino Portal">
      <template #art><Icon nav="care" :size="64" /></template>
      Maintenance comes from the Portal on the Pi (port 5000). Check that it's running, or set its address in Settings.
      <br /><span class="small">{{ care.error }}</span>
    </EmptyState>

    <template v-else-if="care.overview">
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>

      <div class="readouts">
        <Readout label="Overdue" :value="String(care.counts.overdue)" :detail="care.counts.overdue ? 'Fit them in soon' : 'None'" />
        <Readout label="Due soon" :value="String(care.counts.due_soon)" detail="Plan the work, order parts" />
        <Readout label="On hold" :value="String(care.counts.held + care.counts.snoozed)" :detail="`${care.counts.snoozed} snoozed`" />
        <Readout
          label="Production hours"
          :value="prodH ? fmtMeter(prodH.value, '') : null"
          unit="h"
          :detail="prodH?.per_day ? `About ${prodH.per_day.toFixed(1)} h a day` : ''"
        />
      </div>

      <SectionRule label="Due now" />
      <div v-if="care.due.length" class="cards">
        <CareTaskCard v-for="t in care.due" :key="t.id" :task="t" :busy="busy === t.id" @log="logging = $event" @snooze="snooze" />
      </div>
      <p v-else class="muted pad">Nothing is due. Next up: {{ care.upcoming[0]?.title ?? 'nothing scheduled' }}.</p>

      <SectionRule label="Toolheads" />
      <div class="tiles">
        <AssetCareTile v-for="t in tools" :key="t.name" :care="t.care" :look="t.look" :mounted="machine.mountedName === t.name" />
      </div>

      <SectionRule label="Machine" />
      <div class="tiles">
        <AssetCareTile v-for="a in care.areas.filter((x) => x.total > 0)" :key="a.asset" :care="a" />
      </div>

      <SectionRule label="Coming up" />
      <div class="cards">
        <CareTaskCard v-for="t in care.upcoming" :key="t.id" :task="t" compact />
      </div>

      <template v-if="care.held.length">
        <SectionRule label="On hold" />
        <div class="cards">
          <CareTaskCard v-for="t in care.held" :key="t.id" :task="t" :busy="busy === t.id" @log="logging = $event" @snooze="snooze" />
        </div>
      </template>

      <div class="grid two">
        <RsPanel title="Work log" index="L">
          <ul class="log">
            <li v-for="r in log" :key="r.id">
              <span class="date">{{ fmtDay(r.at) }}</span>
              <span class="what">
                <strong>{{ r.title ?? 'Meter' }}</strong>
                <span class="muted"> · {{ r.asset_label }} · {{ ACTION[r.action] ?? r.action }}</span>
                <span v-if="r.notes" class="note">{{ r.notes }}</span>
              </span>
            </li>
          </ul>
        </RsPanel>
        <RsPanel title="Usage meters" index="M">
          <dl class="meters">
            <template v-for="m in machineMeters" :key="m.meter">
              <dt>{{ m.label }}</dt>
              <dd>
                {{ fmtMeter(m.value, m.unit) }}
                <span v-if="m.per_day" class="muted"> · {{ m.per_day >= 10 ? Math.round(m.per_day) : m.per_day.toFixed(1) }} {{ m.unit }}/day</span>
              </dd>
            </template>
          </dl>
          <p class="muted small">Counted by the Portal from Klipper and Moonraker. Each toolhead's own meters show on its Toolheads tile in Phase 5.</p>
        </RsPanel>
      </div>
    </template>

    <p v-else class="muted pad">Loading maintenance from the Portal…</p>

    <LogWorkDialog :task="logging" @close="logging = null" @saved="(t) => flash(`Logged: ${t}`)" />
  </div>
</template>

<style scoped>
.readouts { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(min(230px, 45%), 1fr)); }
.cards { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.tiles { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.two { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); margin-top: var(--rs-space-4); }
.pad { padding: 0 var(--rs-space-1); }
.small { font-size: var(--rs-text-sm); }
.notice { align-self: flex-start; padding: 8px 16px; border-radius: var(--rs-radius-pill); background: var(--rs-paper); color: var(--rs-paper-ink); font-weight: var(--rs-weight-medium); }
.log { list-style: none; margin: 0; padding: 0; max-height: 520px; overflow: auto; }
.log li { display: grid; grid-template-columns: 110px 1fr; gap: var(--rs-space-3); padding: var(--rs-space-3) 0; border-top: 1px solid var(--rs-line); font-size: var(--rs-text-sm); }
.log li:first-child { border-top: 0; }
.date { color: var(--rs-text-muted); font-family: var(--rs-font-code); font-size: var(--rs-text-xs); padding-top: 2px; }
.what strong { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.note { display: block; color: var(--rs-text); margin-top: 2px; }
.meters { display: grid; grid-template-columns: auto 1fr; gap: var(--rs-space-2) var(--rs-space-5); margin: 0 0 var(--rs-space-4); font-size: var(--rs-text-sm); }
.meters dt { color: var(--rs-text-muted); }
.meters dd { margin: 0; color: var(--rs-text-strong); }
</style>
