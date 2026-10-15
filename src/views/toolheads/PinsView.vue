<script setup lang="ts">
/**
 * The board's outputs (every output_pin and PWM channel the config makes,
 * with who shares it) and its pins: free, used by the config, or reserved by
 * an added tool. Read-only; the Portal reads it from the Klipper config.
 */
import { computed, ref } from 'vue'
import { useToolMgrStore } from '@/stores/toolmgr'
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
      <section class="sx-fold" :class="{ open: !shut.out }">
        <button type="button" class="fh" :aria-expanded="!shut.out" @click="shut = { ...shut, out: !shut.out }">
          <span class="sx-chev" /><span class="ft">Outputs</span><span class="fm">output_pin and PWM channels</span>
          <span class="fr"><span class="sx-count">{{ p.channels.length }}</span></span>
        </button>
        <div v-show="!shut.out" class="fb">
          <div class="sx-colhead ocols"><span>Output</span><span>Type</span><span>Contact</span><span>Idle level</span><span>Also used by</span></div>
          <ul class="sx-rows">
            <li v-for="c in p.channels" :key="c.name" class="row ocols">
              <span class="mono strong">{{ c.name }}</span>
              <span><span class="sx-tag plain">{{ c.pwm ? 'PWM' : 'On/off' }}</span></span>
              <span class="sm">{{ c.contact ? `Contact ${c.contact}` : c.hardware ? 'System hardware' : '—' }}{{ c.pin ? ` · ${c.pin}` : '' }}</span>
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
.ocols { grid-template-columns: minmax(150px, 1.2fr) 80px minmax(130px, 1fr) 80px minmax(160px, 1.6fr); align-items: center; }
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
  .ocols { grid-template-columns: 1fr auto; }
  .ocols > :nth-child(n + 3) { grid-column: 1 / -1; }
  .pcols { grid-template-columns: 60px 1fr; }
  .pcols > :nth-child(3) { grid-column: 1 / -1; }
}
</style>
