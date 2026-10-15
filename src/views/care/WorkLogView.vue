<script setup lang="ts">
/**
 * The work log: everything done, skipped, set or measured, newest first,
 * a fold per month. Filter by what it was for or by kind of entry.
 * The Portal keeps the log; nothing here changes it.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { assetChoices, grouped } from '@/maintenance/edit'
import type { HistoryRecord } from '@/maintenance/types'
import { useMaintenanceStore } from '@/stores/maintenance'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const care = useMaintenanceStore()
const route = useRoute()
const router = useRouter()

type Kind = 'all' | 'work' | 'status' | 'meter'
const KINDS: [Kind, string][] = [['all', 'Everything'], ['work', 'Work'], ['status', 'Status changes'], ['meter', 'Meter readings']]
const kindOf = (r: HistoryRecord): Kind => (r.action === 'meter' ? 'meter' : r.action.startsWith('status') ? 'status' : 'work')
const kind = computed<Kind>(() => (KINDS.some(([k]) => k === route.query.show) ? (route.query.show as Kind) : 'all'))
const forAsset = computed(() => (typeof route.query.for === 'string' ? route.query.for : ''))
const setQuery = (k: string, v: string) => router.replace({ query: { ...route.query, [k]: v && v !== 'all' ? v : undefined } })

const choices = computed(() => assetChoices(care.overview))
const rows = computed(() => care.history.filter((r) => (!forAsset.value || r.asset === forAsset.value) && (kind.value === 'all' || kindOf(r) === kind.value)))
const counts = computed(() => {
  const base = care.history.filter((r) => !forAsset.value || r.asset === forAsset.value)
  return Object.fromEntries(KINDS.map(([k]) => [k, k === 'all' ? base.length : base.filter((r) => kindOf(r) === k).length])) as Record<Kind, number>
})
const months = computed(() => {
  const out: { key: string; label: string; rows: HistoryRecord[] }[] = []
  for (const r of rows.value) {
    const d = new Date(r.at * 1000)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let m = out.find((x) => x.key === key)
    if (!m) out.push((m = { key, label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), rows: [] }))
    m.rows.push(r)
  }
  return out
})
// newest two months open, older ones folded until you open them
const toggled = ref<Record<string, boolean>>({})
const isOpen = (i: number, key: string) => (toggled.value[key] ?? i < 2)

const ACTION: Record<string, string> = { done: 'Done', skipped: 'Skipped', status: 'Status set', status_cleared: 'Status cleared', meter: 'Meter set' }
const STATE: Record<string, string> = { overdue: 'overdue', due_soon: 'due soon' }
const what = (r: HistoryRecord) => {
  if (r.action === 'meter') return `${Math.round(r.from ?? 0)} → ${Math.round(r.to ?? 0)}`
  let s = ACTION[r.action] ?? r.action
  if (r.action.startsWith('status')) s += r.status ? `: ${r.status}` : ''
  else if (r.was && STATE[r.was]) s += ` (was ${STATE[r.was]})`
  return s
}
const day = (s: number) => new Date(s * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const time = (s: number) => new Date(s * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Work log</h1>
        <p>Everything done, skipped, set or measured, newest first. Each entry keeps the meter readings of its moment, so schedules restart from the right place.</p>
      </div>
    </div>

    <div class="sx-bar">
      <div class="sx-seg" role="group" aria-label="Show">
        <button v-for="[k, l] in KINDS" :key="k" type="button" :class="{ on: kind === k }" :aria-pressed="kind === k" @click="setQuery('show', k)">{{ l }} <span class="n">{{ counts[k] }}</span></button>
      </div>
      <select class="tm-sel sx-sel" aria-label="For" :value="forAsset" @change="setQuery('for', ($event.target as HTMLSelectElement).value)">
        <option value="">Everything</option>
        <optgroup v-for="[g, cs] in grouped(choices)" :key="g" :label="g"><option v-for="c in cs" :key="c.value" :value="c.value">{{ c.label }}</option></optgroup>
      </select>
    </div>

    <p v-if="care.source !== 'ready' && !care.history.length" class="muted">{{ care.source === 'unavailable' ? `Can't reach the Rhino Portal: ${care.error}` : 'Loading the work log…' }}</p>
    <div v-else-if="!rows.length" class="sx-empty">Nothing logged{{ forAsset || kind !== 'all' ? ' here' : ' yet' }}.</div>

    <section v-for="(m, i) in months" :key="m.key" class="sx-fold" :class="{ open: isOpen(i, m.key) }">
      <button type="button" class="fh" :aria-expanded="isOpen(i, m.key)" @click="toggled = { ...toggled, [m.key]: !isOpen(i, m.key) }">
        <span class="sx-chev" /><span class="ft">{{ m.label }}</span>
        <span class="fr"><span class="fm">{{ m.rows.filter((r) => r.action === 'done').length }} done</span><span class="sx-count">{{ m.rows.length }}</span></span>
      </button>
      <ol v-show="isOpen(i, m.key)" class="fb tl">
        <li v-for="r in m.rows" :key="r.id" class="ent">
          <span class="when"><span class="d">{{ day(r.at) }}</span><span class="t">{{ time(r.at) }}</span></span>
          <span class="mark" :class="r.action" aria-hidden="true" />
          <span class="body">
            <span class="top">
              <RouterLink v-if="r.task" class="tt" :to="`/care/tasks/${encodeURIComponent(r.task)}`">{{ r.title }}</RouterLink>
              <strong v-else class="tt">{{ r.title ?? 'Meter' }}</strong>
              <span class="who">{{ r.asset_label }}</span>
            </span>
            <span class="what">{{ what(r) }}</span>
            <span v-if="r.notes" class="note">{{ r.notes }}</span>
          </span>
        </li>
      </ol>
    </section>
    <p v-if="care.history.length >= 500" class="tm-hint">The newest 500 entries. The Portal keeps them all.</p>
  </div>
</template>

<style scoped>
.tl { list-style: none; margin: 0; }
.ent { display: grid; grid-template-columns: 96px 14px minmax(0, 1fr); gap: var(--rs-space-3); position: relative; padding: var(--rs-space-2) 0; }
.ent::before { content: ''; position: absolute; left: calc(96px + var(--rs-space-3) + 6px); top: 0; bottom: 0; width: 1px; background: var(--rs-line); }
.when { display: flex; flex-direction: column; font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-text-muted); padding-top: 2px; }
.when .d { color: var(--rs-text); }
.mark { position: relative; z-index: 1; width: 13px; height: 13px; margin-top: 4px; border-radius: 50%; background: var(--rs-ink); box-shadow: 0 0 0 3px var(--rs-surface); }
.mark.skipped { background: var(--rs-surface); border: 1.5px solid var(--rs-ink); }
.mark.status, .mark.status_cleared { border-radius: 2px; background: var(--rs-dither-dense), var(--rs-surface); border: 1.5px solid var(--rs-ink); }
.mark.meter { border-radius: 2px; transform: rotate(45deg) scale(0.85); background: var(--rs-surface); border: 1.5px solid var(--rs-ink); }
.body { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: var(--rs-text-sm); }
.top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--rs-space-3); }
.tt { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); text-decoration: none; }
a.tt:hover { text-decoration: underline; text-underline-offset: 3px; }
.who, .what { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.note { color: var(--rs-text); }
@media (max-width: 560px) {
  .ent { grid-template-columns: 70px 14px minmax(0, 1fr); }
  .ent::before { left: calc(70px + var(--rs-space-3) + 6px); }
}
</style>
