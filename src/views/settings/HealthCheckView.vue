<script setup lang="ts">
/**
 * Settings / Health check: the Rhino's own setup check (the same as option 7 of rhino.sh on the host), run from here.
 * Is the host set up the way the Rhino needs, and will it stay that way when left alone? Read only: it looks and says,
 * it changes nothing. Logic: src/system/healthCheck.ts. The Portal runs it: src/stores/healthCheck.ts.
 * (Settings / Host health, next to it, is the live load and temperatures.)
 */
import './settings.css'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useHealthCheckStore } from '@/stores/healthCheck'
import { LEVEL_TONE, LEVEL_WORD, groupBySection, needsAttention, report, verdict } from '@/system/healthCheck'

const h = useHealthCheckStore()
onMounted(() => void h.load())
onUnmounted(() => h.leave())

const result = computed(() => h.state?.result ?? null)
const summary = computed(() => verdict(result.value?.counts))
const attention = computed(() => (result.value ? needsAttention(result.value.results) : []))
const groups = computed(() => (result.value ? groupBySection(result.value.results) : []))
const ranAt = computed(() => (h.state?.at ? new Date(h.state.at * 1000).toLocaleString() : null))
const running = computed(() => h.busy || !!h.state?.running)

const copied = ref(false)
async function copy() {
  if (!result.value) return
  const t = report(result.value, new Date(), __APP_VERSION__)
  try {
    await navigator.clipboard.writeText(t)
  } catch {
    // http:// pages have no clipboard API: fall back to a hidden text box
    const ta = Object.assign(document.createElement('textarea'), { value: t })
    document.body.append(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="Is this Rhino set up properly?" index="01" panel-id="settings.healthcheck.result" class="wide">
        <template #actions>
          <RsButton size="sm" variant="primary" :disabled="running" @click="h.run()">{{ running ? 'Checking…' : result ? 'Check again' : 'Run the check' }}</RsButton>
          <RsButton v-if="result" size="sm" variant="quiet" @click="copy">{{ copied ? 'Copied' : 'Copy report' }}</RsButton>
        </template>
        <p v-if="h.error" class="msg bad">{{ h.error }}</p>
        <p v-if="!result && !running" class="muted small">
          Not run since the Portal last started. The check takes a few seconds. It only looks: it changes nothing and sends nothing to the machine.
        </p>
        <p v-else-if="!result" class="muted small">Checking the host, the boards, the services and the Rhino's files…</p>
        <template v-if="result && summary">
          <p class="row verdict">
            <StatusChip :tone="summary.tone">{{ summary.tone === 'danger' ? 'Fix' : summary.tone === 'warn' ? 'Look' : 'Good' }}</StatusChip>
            <span>{{ summary.text }}</span>
          </p>
          <ul v-if="attention.length" class="finds">
            <li v-for="(f, i) in attention" :key="i">
              <StatusChip :tone="LEVEL_TONE[f.level]">{{ LEVEL_WORD[f.level] }}</StatusChip>
              <span>
                <b>{{ f.what }}</b>
                <span v-if="f.detail" class="detail">{{ f.detail }}</span>
              </span>
            </li>
          </ul>
          <p class="muted small foot">
            Checked {{ ranAt }}. {{ result.counts.PASS }} good, {{ result.counts.WARN }} to look at, {{ result.counts.FAIL }} to fix, {{ result.counts.INFO }} notes.
            The report holds every line, to send with a problem or keep in a note.
          </p>
        </template>
      </RsPanel>

      <RsPanel v-if="groups.length" title="Everything it checked" index="02" panel-id="settings.healthcheck.all" class="wide">
        <details v-for="g in groups" :key="g.section" class="group" :open="g.items.some((i) => i.level !== 'PASS')">
          <summary>
            {{ g.section }}
            <span class="muted small">{{ g.items.filter((i) => i.level === 'PASS').length }} of {{ g.items.length }} good</span>
          </summary>
          <ul class="all">
            <li v-for="(i, n) in g.items" :key="n">
              <StatusChip :tone="LEVEL_TONE[i.level]">{{ LEVEL_WORD[i.level] }}</StatusChip>
              <span>{{ i.what }}<span v-if="i.detail" class="detail">{{ i.detail }}</span></span>
            </li>
          </ul>
        </details>
      </RsPanel>

      <RsPanel title="About this check" index="03" panel-id="settings.healthcheck.about">
        <p class="small">
          This is the same check as option 7 on the Rhino's own menu (<span class="mono">rhino.sh</span>). It looks at the host (sleep, time, USB power
          saving), the boards and cameras, the services, and the Rhino's own files. <b>Fix</b> means the machine isn't ready to be trusted until it is
          sorted. <b>Look</b> works today but is worth a look. <b>Note</b> is for your information.
        </p>
        <p class="muted small">
          For how hard the host is working right now, and how warm it is, see <RouterLink to="/settings/health">Host health</RouterLink>.
          Nothing here moves the machine, and the check runs on the host as its own program, so a problem in it can't stop the Portal.
        </p>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.verdict { margin: 0 0 var(--rs-space-3); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.foot { margin: var(--rs-space-3) 0 0; }
.finds, .all { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--rs-space-2); }
.finds li, .all li { display: flex; align-items: baseline; gap: var(--rs-space-2); color: var(--rs-text-strong); }
.finds li > :first-child, .all li > :first-child { flex: none; }
.finds li > span, .all li > span { min-width: 0; overflow-wrap: anywhere; }
.detail { display: block; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.group { border-top: 1px solid var(--rs-line); padding: var(--rs-space-2) 0; }
.group summary { cursor: pointer; display: flex; justify-content: space-between; gap: var(--rs-space-3); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.group .all { margin-top: var(--rs-space-2); }
.set-page .grid { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
</style>
