<script setup lang="ts">
/**
 * "What's happening" (Mike, Nov 15): a read-only strip for the tuning wizards and the Care guides. One plain sentence
 * about what the machine is doing (heating, running a test job, sending a command), and under it the last few console
 * lines. There is no input box: it only shows. It appears while something is going on and is hidden when the
 * machine is idle and cold. Look-only: nothing here can reach the machine.
 */
import { computed, ref } from 'vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { happening, worthShowing } from './happening'

const machine = useMachineStore()
const control = useControlStore()
const more = ref(false)

const h = computed(() =>
  happening({ hotend: machine.hotend, bed: machine.bed, job: machine.job, running: control.running }),
)
const recent = computed(() =>
  control.lines
    .filter((l) => worthShowing(l.text))
    .slice(more.value ? -30 : -5)
    .reverse(),
)
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
</script>

<template>
  <section v-if="h" class="live" role="status" aria-label="What's happening">
    <p class="head"><span class="dot" aria-hidden="true" />{{ h.headline }}</p>
    <p v-for="l in h.lines" :key="l" class="sub">{{ l }}</p>
    <p v-if="h.leaveNote" class="sub">{{ h.leaveNote }}</p>
    <ul v-if="recent.length" class="log" aria-label="Recent console lines, newest first">
      <li v-for="l in recent" :key="l.id" :class="l.kind"><time>{{ clock(l.time) }}</time> <span>{{ l.kind === 'sent' ? '› ' : '' }}{{ l.text }}</span></li>
    </ul>
    <p class="foot">
      <button type="button" class="link" @click="more = !more">{{ more ? 'Show fewer lines' : 'Show more lines' }}</button>
      <span class="muted">Read only. <RouterLink to="/control">Open the console</RouterLink></span>
    </p>
  </section>
</template>

<style scoped>
.live { border: 1px solid var(--rs-line-strong); border-radius: 8px; padding: var(--rs-space-3); margin-bottom: var(--rs-space-3); background: var(--rs-surface-2); }
.head { margin: 0; font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--rs-ink); animation: pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
@keyframes pulse { 50% { opacity: 0.25; } }
.sub { margin: 4px 0 0; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.log { list-style: none; margin: var(--rs-space-2) 0 0; padding: 0; display: grid; gap: 1px; font: var(--rs-text-xs) / 1.5 var(--rs-font-code); }
.log li { display: flex; gap: 8px; min-width: 0; color: var(--rs-text-muted); }
.log li.error { color: var(--rs-text-strong); font-weight: 700; }
.log time { color: var(--rs-text-muted); flex: none; }
.log span { overflow-wrap: anywhere; }
.foot { margin: var(--rs-space-2) 0 0; display: flex; gap: var(--rs-space-3); flex-wrap: wrap; font-size: var(--rs-text-xs); }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--rs-text-strong); text-decoration: underline; cursor: pointer; }
.muted { color: var(--rs-text-muted); }
</style>
