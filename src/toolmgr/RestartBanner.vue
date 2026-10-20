<script setup lang="ts">
/**
 * Tool changes saved in the Portal but not live yet: Klipper loads
 * custom_tools.cfg only when it restarts.
 *
 * Restart Klipper asks first (it stops anything the machine is doing and
 * turns the heaters off), and is offered only when the machine is idle; the
 * Portal refuses during a job anyway. During a job it offers to restart by
 * itself when the job ends instead.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useToolMgrStore } from '@/stores/toolmgr'
import { useControlStore } from '@/stores/control'

const tm = useToolMgrStore()
const control = useControlStore()
const err = ref<string | null>(null)
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(tick))

const p = computed(() => tm.pending)
const changes = computed(() => p.value?.changes ?? [])
const pr = computed(() => tm.printer)
const skew = computed(() => (tm.state?.server_time ? tm.state.server_time * 1000 - Date.now() : 0))
const autoIn = computed(() => {
  const at = p.value?.restart_at
  return at && !tm.restartBlocked ? Math.max(0, Math.round(at - (now.value + skew.value) / 1000)) : null
})
const why = computed(() => {
  if (tm.restarting) return 'Restarting Klipper…'
  if (!pr.value?.online) return "Moonraker isn't answering, so the Portal can't restart Klipper. Restart it from Mainsail."
  if (tm.restartBlocked)
    return `Klipper loads them at its next restart, which waits until the job ${pr.value.print_state === 'paused' ? 'is finished (it is paused now)' : 'finishes'}: restarting now would stop it.`
  if (autoIn.value != null) return autoIn.value > 0 ? `The job has finished. Klipper restarts by itself in ${autoIn.value} s.` : 'Restarting Klipper…'
  return 'Klipper has to restart to load them. The machine is idle, so it is safe now.'
})

async function restart() {
  err.value = null
  const ok = await control.confirm({
    title: 'Restart Klipper?',
    body: 'Klipper restarts to load the saved changes. Heaters switch off and the machine forgets where it is: home it again afterwards, and answer the "which toolhead is mounted?" question when it appears.',
    feature: changes.value.length === 1 ? changes.value[0] : `${changes.value.length} changes`,
    confirmLabel: 'Restart Klipper',
    tone: 'normal',
  })
  if (!ok) return
  try {
    await tm.restart()
  } catch (e) {
    err.value = (e as Error).message
  }
}

async function auto(on: boolean) {
  err.value = null
  try {
    await tm.setAutoRestart(on)
  } catch (e) {
    err.value = (e as Error).message
  }
}
</script>

<template>
  <section v-if="p" class="banner" role="status" aria-live="polite">
    <span class="mark" aria-hidden="true" />
    <div class="text">
      <strong>{{ changes.length > 1 ? `${changes.length} changes are saved but not live yet` : 'A change is saved but not live yet' }}</strong>
      <ul v-if="changes.length">
        <li v-for="(c, i) in changes.slice(-6)" :key="i">{{ c }}</li>
        <li v-if="changes.length > 6" class="muted">and {{ changes.length - 6 }} earlier</li>
      </ul>
      <p class="why">{{ why }}</p>
      <p v-if="tm.restartBlocked && pr?.job" class="job">
        {{ pr.print_state === 'paused' ? 'Paused' : 'Running' }}: {{ pr.job.filename }} · {{ Math.round((pr.job.progress ?? 0) * 100) }}%
      </p>
      <label v-if="tm.restartBlocked" class="auto">
        <input type="checkbox" :checked="!!p.auto_restart" @change="auto(($event.target as HTMLInputElement).checked)" />
        Restart Klipper by itself when the job finishes
      </label>
      <p v-if="p.note" class="muted">{{ p.note }}</p>
      <p v-if="err" class="err">{{ err }}</p>
    </div>
    <RsButton v-if="!tm.restartBlocked && pr?.online && autoIn == null" variant="primary" :disabled="tm.restarting" @click="restart">
      {{ tm.restarting ? 'Restarting…' : 'Restart Klipper' }}
    </RsButton>
  </section>
</template>

<style scoped>
.banner {
  display: flex; align-items: flex-start; gap: var(--rs-space-4);
  padding: var(--rs-space-4) var(--rs-space-5);
  border-radius: var(--rs-radius-lg); border: 1.5px solid var(--rs-ink);
  background: var(--rs-surface);
}
.mark { flex: none; width: 14px; align-self: stretch; border-radius: 3px; background: var(--rs-dither-dense); box-shadow: inset 0 0 0 1px var(--rs-dot); }
.text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: var(--rs-text-sm); }
strong { color: var(--rs-text-strong); font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); }
ul { margin: 2px 0; padding-left: 18px; color: var(--rs-text-strong); }
.why, .job { margin: 0; color: var(--rs-text); }
.job { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); }
.auto { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.auto input { width: 16px; height: 16px; accent-color: var(--rs-text-strong); }
.muted { color: var(--rs-text-muted); margin: 0; }
.err { margin: 0; color: var(--rs-danger); }
@media (max-width: 560px) { .banner { flex-direction: column; } .mark { width: auto; height: 6px; align-self: stretch; } }
</style>
