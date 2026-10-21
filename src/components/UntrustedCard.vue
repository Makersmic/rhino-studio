<script setup lang="ts">
/**
 * Shown instead of the page when Moonraker doesn't trust this screen: Mainsail's
 * "Unauthorized", with the same fix (trusted_clients in moonraker.conf). There is
 * no login; Studio works the way Mainsail does.
 * The address comes from the Rhino Portal, which sees the same one Moonraker does.
 */
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import { useMachineStore } from '@/stores/machine'
import { useSettingsStore, portalBase } from '@/stores/settings'
import { suggestRange } from '@/moonraker/trust'

const machine = useMachineStore()
const settings = useSettingsStore()
const address = ref<string | null>(null)
const range = computed(() => suggestRange(address.value))
const snippet = computed(() => `[authorization]\ntrusted_clients:\n    ${range.value}`)
const copied = ref(false)

onMounted(async () => {
  try {
    const r = await fetch(`${portalBase(settings.portalUrl)}/api/state`, { headers: { Accept: 'application/json' } })
    const j = (await r.json()) as { address?: string }
    if (typeof j.address === 'string') address.value = j.address
  } catch {
    /* the Portal can't say: the text points at moonraker.log instead */
  }
})

async function copy() {
  try {
    await navigator.clipboard.writeText(snippet.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* select it by hand */
  }
}
const retry = () => machine.connect(settings.moonrakerUrl)
</script>

<template>
  <div class="wrap">
    <RsPanel title="Moonraker doesn't trust this screen" class="card">
      <div class="stack">
        <p class="lead">
          <template v-if="address">This screen's address, <strong class="mono">{{ address }}</strong>, isn't</template>
          <template v-else>This screen's address isn't</template>
          in Moonraker's <code>trusted_clients</code>, so Moonraker won't let it connect. Mainsail would say "Unauthorized" here too.
        </p>
        <p class="step">Add it in <code>moonraker.conf</code> (from a trusted screen: Settings › Trusted addresses, or over SSH), keeping any lines already there:</p>
        <pre class="snip">{{ snippet }}</pre>
        <p v-if="!address" class="hint">Not sure of the address? <code>moonraker.log</code> names it next to "Unauthorized". A <code>/24</code> range lets the whole home network in.</p>
        <p class="step">Then restart Moonraker and try again.</p>
        <div class="row">
          <RsButton variant="primary" @click="retry">Try again</RsButton>
          <RsButton variant="quiet" @click="copy">{{ copied ? 'Copied' : 'Copy the lines' }}</RsButton>
        </div>
      </div>
    </RsPanel>
  </div>
</template>

<style scoped>
.wrap { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding: clamp(24px, 10vh, 96px) 16px 32px; }
.card { width: 100%; max-width: 460px; }
.stack { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.lead, .step, .hint { margin: 0; line-height: 1.5; }
.lead { color: var(--rs-text-strong); }
.step { font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.hint { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.mono, code, .snip { font-family: var(--rs-font-code); }
code { font-size: 0.92em; }
.snip { margin: 0; padding: 10px 12px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); border: 1px solid var(--rs-line); font-size: 13px; line-height: 1.5; white-space: pre; overflow-x: auto; color: var(--rs-text-strong); }
.row { display: flex; gap: var(--rs-space-3); flex-wrap: wrap; }
</style>
