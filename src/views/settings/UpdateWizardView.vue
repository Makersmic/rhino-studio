<script setup lang="ts">
/**
 * Settings / Update the Rhino: the Tool Manager update in five steps. Before (is it safe: no job, space, the updater is
 * there), Back up, Install (the existing GitHub update through the root-owned updater), Check (the Health check, before
 * and after), and what to do if something is wrong. Writes nothing itself: it uses Back up now and the GitHub install
 * that Settings > Software already has. Studio reloads when the install finishes and this wizard reopens at the check.
 * Design: Tool Manager docs/proposal-update-wizard.md, docs/wizard-rules.md. Logic: src/update/wizard.ts.
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import { UPDATE_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useHealthCheckStore } from '@/stores/healthCheck'
import { LEVEL_TONE, LEVEL_WORD, verdict } from '@/system/healthCheck'
import { stepMarks } from '@/system/zipUpdate'
import type { UpdateState, BackupArchive } from '@/portal/client'
import type { HostStats } from '@/system/hostHealth'
import { beforeChecks, clearResume, compare, loadResume, saveResume, type Resume } from '@/update/wizard'

const STEPS = [
  { id: 'before', label: 'Before', help: 'Is it safe to start?' },
  { id: 'backup', label: 'Back up', help: 'A copy to go back to' },
  { id: 'install', label: 'Install', help: 'The release from GitHub' },
  { id: 'check', label: 'Check', help: 'Before and after' },
  { id: 'wrong', label: 'If it’s wrong', help: 'How to go back' },
] as const
type StepId = (typeof STEPS)[number]['id']

const router = useRouter()
const machine = useMachineStore()
const maint = useMaintenanceStore()
const health = useHealthCheckStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)
const now = ref(Date.now() / 1000)

const st = ref<UpdateState | null>(null)
const stats = ref<HostStats | null>(null)
const lastBackup = ref<number | null>(null)
const readError = ref<string | null>(null)
const resume = ref<Resume | null>(null)

async function load() {
  const p = maint.portal()
  if (!p) return void (readError.value = 'The Rhino Portal isn’t connected, so the update can’t be checked from here.')
  now.value = Date.now() / 1000
  try {
    st.value = await p.updateState(true)
    readError.value = null
  } catch (e) {
    readError.value = (e as Error).message
  }
  try {
    stats.value = await p.hostStats()
  } catch {
    stats.value = null
  }
  try {
    const b = await p.backups()
    lastBackup.value = b?.archives.filter((a) => a.complete).sort((x, y) => y.time - x.time)[0]?.time ?? null
  } catch {
    lastBackup.value = null
  }
}

const target = computed(() => st.value?.latest?.version ?? null)
const free = computed(() => stats.value?.disks.find((d) => d.path === '/')?.free ?? stats.value?.disks[0]?.free ?? null)
const before = computed(() =>
  beforeChecks({
    online: !!st.value,
    installed: st.value?.installed ?? null,
    latest: st.value?.latest ?? null,
    helper: !!st.value?.helper,
    busy: !!st.value?.busy,
    jobState: machine.job.state ?? null,
    freeBytes: free.value,
    lastBackup: lastBackup.value,
    now: now.value,
  }),
)
const healthCounts = computed(() => health.state?.result?.counts ?? null)

onMounted(async () => {
  await load()
  const r = loadResume(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, st.value?.installed ?? null, Date.now() / 1000)
  if (r) {
    resume.value = r
    at.value = 3
    void health.run()
  } else if (!health.state?.result) {
    void health.run() // the "before" numbers
  }
})

// ---- step 2: back up
const backing = ref(false)
const backup = ref<BackupArchive | null>(null)
const backupError = ref<string | null>(null)
const noBackup = ref(false)
async function backUp() {
  const p = maint.portal()
  if (!p) return
  backing.value = true
  backupError.value = null
  try {
    backup.value = (await p.backupNow()).archive
    lastBackup.value = backup.value.time
  } catch (e) {
    backupError.value = (e as Error).message
  } finally {
    backing.value = false
  }
}
const backupOk = computed(() => !!backup.value?.complete || noBackup.value)

// ---- step 3: install
const installing = ref(false)
const installError = ref<string | null>(null)
const reconnecting = ref(false)
const reloadIn = ref<number | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
const run = computed(() => st.value?.status ?? null)
const marks = computed(() => (run.value ? stepMarks(run.value) : []))

async function install() {
  const p = maint.portal()
  const to = target.value
  if (!p || !to || !st.value) return
  installing.value = true
  installError.value = null
  const c = healthCounts.value
  saveResume(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, {
    from: st.value.installed,
    to,
    backup: backup.value?.name ?? null,
    before: c ? { fix: c.FAIL, look: c.WARN } : null,
    at: Date.now() / 1000,
  })
  try {
    await p.installFromGitHub(to)
    poll()
  } catch (e) {
    installError.value = (e as Error).message
    installing.value = false
    clearResume(typeof sessionStorage === 'undefined' ? undefined : sessionStorage)
  }
}
async function pollOnce() {
  const p = maint.portal()
  if (!p) return
  try {
    st.value = await p.updateState()
    reconnecting.value = false
    const s = st.value.status
    if (s.state === 'done') {
      installing.value = false
      startReload()
      return
    }
    if (s.state === 'failed') {
      installing.value = false
      installError.value = s.error || 'The install stopped. The log is in Settings > Software.'
      clearResume(typeof sessionStorage === 'undefined' ? undefined : sessionStorage)
      return
    }
  } catch {
    reconnecting.value = true // the Portal restarts in the middle of an install: that is expected
  }
  poll()
}
function poll() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void pollOnce(), 2000)
}
function startReload() {
  reloadIn.value = 5
  const tick = () => {
    if (reloadIn.value == null) return
    if (reloadIn.value <= 0) return location.reload()
    reloadIn.value -= 1
    setTimeout(tick, 1000)
  }
  setTimeout(tick, 1000)
}
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  reloadIn.value = null
})

// ---- step 4: check
const after = computed(() => compare(resume.value, st.value?.installed ?? null, healthCounts.value ? { FAIL: healthCounts.value.FAIL, WARN: healthCounts.value.WARN } : null))
const afterVerdict = computed(() => verdict(health.state?.result?.counts))

function go(delta: number) {
  at.value = Math.max(0, Math.min(STEPS.length - 1, at.value + delta))
  if (step.value === 'check' && !health.busy && !health.state?.running) void health.run()
}
function finish() {
  clearResume(typeof sessionStorage === 'undefined' ? undefined : sessionStorage)
  void router.push('/settings/software')
}
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />

    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="update.step">
      <MascotRow :pose="UPDATE_STEP_POSE[step]">
        <!-- ===== 1 Before ===== -->
        <template v-if="step === 'before'">
          <p class="q">Is it safe to update now?</p>
          <p v-if="readError" class="tm-err" role="alert">{{ readError }}</p>
          <ul class="list checks">
            <li v-for="(l, i) in before.items" :key="i">
              <StatusChip :tone="LEVEL_TONE[l.level]">{{ LEVEL_WORD[l.level] }}</StatusChip>
              <span>{{ l.what }}<span v-if="l.detail" class="detail">{{ l.detail }}</span></span>
            </li>
            <li v-if="healthCounts">
              <StatusChip :tone="healthCounts.FAIL ? 'danger' : healthCounts.WARN ? 'warn' : 'ok'">{{ healthCounts.FAIL ? 'Fix' : healthCounts.WARN ? 'Look' : 'Good' }}</StatusChip>
              <span>Health check now: {{ healthCounts.FAIL }} to fix, {{ healthCounts.WARN }} to look at<span class="detail">Kept to compare after the update.</span></span>
            </li>
          </ul>
          <p v-if="target && before.newer" class="plain">
            <b>Read what changed first.</b>
            <template v-if="st?.latest?.notes_url"> <a :href="st.latest.notes_url" target="_blank" rel="noopener">The release notes for {{ target }}</a>.</template>
            If they say <b>Klipper macros change</b>, keep a hand near Stop after the update and run that release's checks (<span class="mono">docs/testing.md</span>).
          </p>
          <p class="plain">Klipper, Moonraker and the other packages are updated from <RouterLink to="/settings/software">Software</RouterLink>. A Klipper update can need the boards' firmware flashed again; this wizard doesn't do that.</p>
          <WhatThisDoes>
            <p>Read from the Rhino: the installed and the newest release (GitHub's release record, asked at most once an hour), the updater's state, whether a job is running, the free space on the system disk, and the newest completed backup. Nothing is changed.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 2 Back up ===== -->
        <template v-if="step === 'backup'">
          <p class="q">Make a backup first.</p>
          <p class="plain">The update keeps a copy of the config folder too, but a backup is the one you can take elsewhere. It takes a few seconds.</p>
          <p class="row">
            <RsButton variant="primary" :disabled="backing" @click="backUp">{{ backing ? 'Backing up…' : backup ? 'Back up again' : 'Back up now' }}</RsButton>
            <StatusChip v-if="backup?.complete" tone="ok">Good</StatusChip>
            <span v-if="backup?.complete" class="plain">Done: <span class="mono">{{ backup.name }}</span></span>
          </p>
          <p v-if="backupError" class="tm-err" role="alert">{{ backupError }}</p>
          <label v-if="!backup?.complete" class="chip"><input v-model="noBackup" type="checkbox"> I'll go without a backup this time</label>
          <WhatThisDoes>
            <p>The same Back up now as Settings &gt; Host: the Portal writes a zip of the Rhino's own data (tools, maintenance, settings, pictures, fonts) into <span class="mono">~/rhino-backups</span> and checks it is complete. The next step doesn't start until it is.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 3 Install ===== -->
        <template v-if="step === 'install'">
          <p class="q">Install {{ target ?? 'the update' }}.</p>
          <p class="plain">The Rhino downloads the release from GitHub, checks its signature and SHA256, then a root-owned updater installs it. <b>The Portal restarts, and Klipper restarts if the release needs it</b> (heaters off, axes need homing). Studio shows "Reconnecting" for a moment and reloads itself when it's done.</p>
          <p v-if="!installing && !reloadIn && run?.state !== 'done'" class="row">
            <RsButton variant="primary" :disabled="!before.ready || !backupOk || installing" @click="install">Install {{ target }}</RsButton>
            <span v-if="!before.ready" class="tm-hint">Not ready: see the first step.</span>
            <span v-else-if="!backupOk" class="tm-hint">Back up first (or choose to go without).</span>
          </p>
          <p v-if="installError" class="tm-err" role="alert">{{ installError }}</p>
          <ul v-if="installing || marks.length" class="list steps">
            <li v-for="m in marks" :key="m.name" :class="m.mark"><span class="mk">{{ m.mark === 'done' ? '✓' : m.mark === 'now' ? '…' : m.mark === 'failed' ? '✕' : '·' }}</span>{{ m.name }}</li>
          </ul>
          <p v-if="reconnecting" class="plain"><StatusChip tone="neutral">Wait</StatusChip> Reconnecting to the Portal. It restarts in the middle of an install; this is normal.</p>
          <p v-if="reloadIn != null" class="plain"><StatusChip tone="ok">Good</StatusChip> Installed. Studio reloads in {{ reloadIn }} seconds and opens the check.</p>
          <WhatThisDoes>
            <p>This is Settings &gt; Software's "Update the Rhino Tool Manager" from GitHub (<span class="mono">POST /api/update/github</span>): download, SHA256 and signature check, then <span class="mono">rhino-update.service</span> installs it. Your config folder is backed up first; <span class="mono">rhino.sh</span> option 4 undoes it.</p>
            <p>An install already running, or a job, is refused by the Portal as well as here.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 4 Check ===== -->
        <template v-if="step === 'check'">
          <p class="q">Does it look right now?</p>
          <p class="row"><StatusChip :tone="after.tone">{{ after.tone === 'danger' ? 'Fix' : after.tone === 'warn' ? 'Look' : 'Good' }}</StatusChip><span class="plain">{{ after.text }}</span></p>
          <p v-if="health.busy || health.state?.running" class="plain">Running the Health check…</p>
          <p v-else-if="afterVerdict" class="row"><StatusChip :tone="afterVerdict.tone">{{ afterVerdict.tone === 'danger' ? 'Fix' : afterVerdict.tone === 'warn' ? 'Look' : 'Good' }}</StatusChip><span class="plain">{{ afterVerdict.text }}. <RouterLink to="/settings/health-check">See every line</RouterLink>.</span></p>
          <p v-if="health.error" class="tm-err" role="alert">{{ health.error }}</p>
          <p class="plain">Klipper: <b>{{ machine.klippyReady ? 'ready' : 'not ready yet' }}</b>. <template v-if="!machine.klippyReady">Give it a minute after a restart, then check again.</template></p>
          <p class="plain">If the release notes said <b>Klipper macros change</b>, run the checks for that release now (<span class="mono">docs/testing.md</span>), with a hand near Stop.</p>
          <p class="row"><RsButton :disabled="health.busy || !!health.state?.running" @click="health.run()">Check again</RsButton></p>
          <WhatThisDoes>
            <p>The same check as Settings &gt; Health check and option 7 on the Rhino's menu. "Before" is the result kept when the update started; "Now" is the result of this run.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 5 If wrong ===== -->
        <template v-if="step === 'wrong'">
          <p class="q">If something looks wrong, you can go back.</p>
          <p class="plain">Every install keeps the config folder as it was. Going back is done on the Rhino's own menu, over SSH. It puts back the old config, Studio and nginx settings.</p>
          <pre class="tm-pre">bash ~/rhino-manager/rhino.sh     # then choose 4, Undo</pre>
          <p class="plain">Then reload Studio. If Klipper won't start, <b>send the Health check's report</b> (Copy report) with the last lines of <span class="mono">klippy.log</span> before changing anything else.</p>
          <p class="plain">You can also install an older release again from <RouterLink to="/settings/software">Software</RouterLink> (Install from zip, with its <span class="mono">.sig</span> file).</p>
          <WhatThisDoes>
            <p>Undo (<span class="mono">rhino.sh</span> option 4, which runs <span class="mono">uninstall.sh</span>) restores the config folder, the Studio folder and the nginx sites from the backup the install made, and restarts the Portal. Undoing from Studio isn't built; it needs a change to the root-owned updater and has its own write-up.</p>
          </WhatThisDoes>
        </template>
      </MascotRow>
    </RsPanel>

    <footer class="bar">
      <RsButton v-if="at > 0" :disabled="installing" @click="go(-1)">Back</RsButton>
      <RsButton v-if="at < STEPS.length - 1" variant="primary" :disabled="installing" @click="go(1)">Next</RsButton>
      <RsButton v-else variant="primary" @click="finish">Done</RsButton>
      <span class="tm-hint">Step {{ at + 1 }} of {{ STEPS.length }}</span>
      <RsButton class="cancel" variant="quiet" :disabled="installing" @click="router.push('/settings/software')">Close</RsButton>
    </footer>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.mono { font-family: var(--rs-font-code); overflow-wrap: anywhere; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.checks li { display: flex; align-items: baseline; gap: var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.checks li > :first-child { flex: none; }
.checks li > span { min-width: 0; overflow-wrap: anywhere; }
.detail { display: block; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.steps li { display: flex; gap: 10px; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.steps li.done, .steps li.now { color: var(--rs-text-strong); }
.steps li.failed { color: var(--rs-danger); }
.mk { width: 1.2em; text-align: center; font-family: var(--rs-font-code); }
.chip { display: flex; align-items: flex-start; gap: 8px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.chip input { margin-top: 3px; accent-color: var(--rs-text-strong); }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.cancel { margin-left: auto; }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
