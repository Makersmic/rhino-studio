<script setup lang="ts">
/**
 * Settings / Host / Backups (Tool Manager 1.7, docs/phase2-backup.md in Toolhead_Manager).
 *
 * Back up now: the Portal makes one complete archive in ~/rhino-backups on the
 * Rhino (config, Moonraker's database with job history and settings, toolhead
 * photos) or refuses and keeps nothing (INV-B4). Then klipper-backup pushes to
 * GitHub if it's set up; the GitHub line never says "pushed" unless it worked (INV-B8).
 *
 * Restore: pick a backup and what to bring back, see what changes, then confirm.
 * A full restore needs this machine's name typed. Every restore makes a backup of
 * how things are first. Nothing here runs during a job.
 *
 * Lists follow the design rule: details in small type under the name.
 */
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import type { BackupArchive, BackupState, RestorePlan } from '@/portal/client'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { archiveLine, backupBlock, githubLine, headline, planLines, serialProblem } from './backup'

const care = useMaintenanceStore()
const machine = useMachineStore()
const control = useControlStore()

const st = ref<BackupState | null>(null)
const tooOld = ref(false)
const reachable = ref(true)
const working = ref<string | null>(null)
const msg = ref<{ text: string; bad: boolean } | null>(null)
const picker = ref<HTMLInputElement | null>(null)

// restore flow
const pick = ref<BackupArchive | null>(null)
const item = ref('')
const plan = ref<RestorePlan | null>(null)
const typed = ref('')

const block = computed(() => backupBlock({ online: machine.online, jobState: machine.job.state ?? '', portal: reachable.value && !!st.value }))
const head = computed(() => headline(st.value))
const gh = computed(() => githubLine(st.value))
const items = computed(() => Object.entries(st.value?.items ?? {}))
const serial = computed(() => serialProblem(plan.value))
const fullReady = computed(() => !!plan.value && plan.value.item === 'all' && !serial.value && typed.value.trim() === plan.value.this_host)

async function load() {
  const c = care.portal()
  if (!c) {
    reachable.value = false
    return
  }
  try {
    const s = await c.backups()
    tooOld.value = s === null
    st.value = s
    reachable.value = true
  } catch {
    reachable.value = false
  }
}
onMounted(() => void load())

async function backupNow() {
  const c = care.portal()
  if (!c || block.value) return
  working.value = 'now'
  msg.value = null
  try {
    const r = await c.backupNow()
    msg.value = { text: `Backed up: ${r.archive.name} (${r.archive.files ?? '?'} files).`, bad: false }
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    working.value = null
    await load()
    // the GitHub push runs after; look again shortly
    setTimeout(() => void load(), 8000)
  }
}

async function upload(files: FileList | null) {
  const f = files?.[0]
  const c = care.portal()
  if (!f || !c) return
  working.value = 'upload'
  msg.value = null
  try {
    const r = await c.uploadBackup(f)
    msg.value = { text: `Added ${r.archive.name}. It was checked file by file and is ready to restore from.`, bad: false }
    await load()
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    working.value = null
    if (picker.value) picker.value.value = ''
  }
}

function startRestore(a: BackupArchive) {
  pick.value = a
  item.value = ''
  plan.value = null
  typed.value = ''
  msg.value = null
}
function cancelRestore() {
  pick.value = null
  plan.value = null
}

async function showPlan() {
  const c = care.portal()
  if (!c || !pick.value || !item.value) return
  working.value = 'plan'
  plan.value = null
  try {
    plan.value = await c.restorePlan(pick.value.name, item.value)
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    working.value = null
  }
}

async function doRestore() {
  const c = care.portal()
  const p = plan.value
  if (!c || !p || block.value) return
  const full = p.item === 'all'
  if (full ? !fullReady.value : false) return
  if (!full) {
    const ok = await control.confirm({
      title: `Restore ${st.value?.items[p.item] ?? p.item}?`,
      body: `From ${p.archive}. A backup of how things are now is made first, so you can go back.`,
      confirmLabel: 'Restore',
      tone: 'normal',
    })
    if (!ok) return
  }
  working.value = 'restore'
  msg.value = null
  try {
    const r = await c.restore(p.archive, p.item, full ? typed.value.trim() : '')
    msg.value = { text: `Restored. ${r.note} The state before is kept as ${r.before}.`.replace(/\s+/g, ' '), bad: false }
    cancelRestore()
  } catch (e) {
    const t = (e as Error).message
    // a full restore restarts Moonraker, which can drop the answer: that's the expected end
    if (full && /reach the Rhino Portal|Disconnected/i.test(t)) {
      msg.value = { text: 'Restoring: Klipper and Moonraker are restarting. Studio reconnects by itself.', bad: false }
      cancelRestore()
    } else msg.value = { text: t, bad: true }
  } finally {
    working.value = null
    await load()
  }
}
</script>

<template>
  <RsPanel title="Backups" index="04" panel-id="settings.host.backups" class="wide">
    <p v-if="tooOld" class="muted small">Backups need Rhino Tool Manager 1.7 on the Rhino. Update it in Settings › Software.</p>
    <p v-else-if="!reachable" class="muted small">The Rhino Portal isn’t answering, so backups can’t be shown.</p>
    <div v-else-if="st" class="bk">
      <div class="headrow">
        <span class="txt">
          <strong :class="{ warn: head.tone === 'warn' }">{{ head.text }}</strong>
          <span class="muted small" :class="{ bad: gh.bad }">{{ gh.text }}</span>
          <span class="muted small">Kept on the Rhino in {{ st.folder }}, the last {{ st.keep }}. Config, job history, Studio and Mainsail settings, toolhead photos.</span>
        </span>
        <RsButton variant="primary" :disabled="!!block || !!working" :title="block ?? ''" @click="backupNow">{{ working === 'now' ? 'Backing up…' : 'Back up now' }}</RsButton>
      </div>
      <p v-if="block" class="muted small">{{ block }}.</p>
      <p v-if="msg" class="msg" :class="{ bad: msg.bad }" role="status">{{ msg.text }}</p>

      <!-- restore flow -->
      <div v-if="pick" class="restore">
        <p class="sub-h">Restore from {{ pick.name }}</p>
        <fieldset class="choices">
          <legend class="visually-hidden">What to restore</legend>
          <label v-for="[k, label] in items" :key="k" class="check">
            <input v-model="item" type="radio" name="restore-item" :value="k" @change="plan = null" />
            <span>{{ label }}</span>
          </label>
          <label class="check">
            <input v-model="item" type="radio" name="restore-item" value="all" @change="plan = null" />
            <span>Everything (full restore: config, Moonraker’s database, photos; Klipper and Moonraker restart)</span>
          </label>
        </fieldset>
        <div class="row">
          <RsButton :disabled="!item || !!working" @click="showPlan">{{ working === 'plan' ? 'Checking…' : 'Show what changes' }}</RsButton>
          <RsButton variant="quiet" @click="cancelRestore">Cancel</RsButton>
        </div>
        <div v-if="plan" class="plan">
          <ul>
            <li v-for="l in planLines(plan)" :key="l">{{ l }}</li>
          </ul>
          <p v-if="serial" class="msg bad">{{ serial }}</p>
          <template v-else-if="plan.item === 'all'">
            <label class="field">
              <span>Type this machine’s name, <strong class="mono">{{ plan.this_host }}</strong>, to confirm</span>
              <input v-model="typed" class="mono" autocomplete="off" spellcheck="false" />
            </label>
            <RsButton variant="danger-outline" :disabled="!fullReady || !!block || !!working" :title="block ?? ''" @click="doRestore">{{ working === 'restore' ? 'Restoring…' : 'Restore everything' }}</RsButton>
          </template>
          <RsButton v-else variant="primary" :disabled="!!block || !!working" :title="block ?? ''" @click="doRestore">{{ working === 'restore' ? 'Restoring…' : 'Restore' }}</RsButton>
        </div>
      </div>

      <ul v-if="st.archives.length" class="list">
        <li v-for="a in st.archives" :key="a.name">
          <span class="txt">
            <strong class="mono name">{{ a.name }}</strong>
            <span class="muted small">{{ archiveLine(a) }}</span>
          </span>
          <a class="link" :href="care.portal()?.backupUrl(a.name)" :download="a.name">Download</a>
          <RsButton size="sm" :disabled="!a.complete || !!block || !!working" :title="block ?? ''" @click="startRestore(a)">Restore…</RsButton>
        </li>
      </ul>
      <p v-else class="muted small">No backups yet. Back up now makes the first one.</p>

      <div class="add">
        <RsButton variant="quiet" size="sm" :disabled="!!working" @click="picker?.click()">{{ working === 'upload' ? 'Checking…' : 'Add a backup from another Rhino…' }}</RsButton>
        <span class="muted small">For moving to a new host: a rhino-&lt;name&gt;-&lt;date&gt;.zip, checked before it’s listed.</span>
        <input ref="picker" type="file" accept=".zip" class="visually-hidden" @change="upload(($event.target as HTMLInputElement).files)" />
      </div>
    </div>
  </RsPanel>
</template>

<style scoped>
.bk { container-type: inline-size; }
.headrow { display: flex; align-items: flex-start; gap: var(--rs-space-3); margin-bottom: var(--rs-space-2); }
.txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.txt strong { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.txt strong.warn::before { content: '! '; }
.bad { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.list { list-style: none; margin: var(--rs-space-3) 0 0; padding: 0; }
.list li { display: flex; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-2) 0; border-top: 1px solid var(--rs-line); }
.name { overflow-wrap: anywhere; font-size: var(--rs-text-sm); }
.restore { margin: var(--rs-space-3) 0; padding: var(--rs-space-3) var(--rs-space-4); border-radius: var(--rs-radius-md); background: var(--rs-surface-2); border-left: 3px solid var(--rs-ink); }
.choices { border: 0; margin: 0 0 var(--rs-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--rs-space-2); }
.plan { margin-top: var(--rs-space-3); }
.plan ul { margin: 0 0 var(--rs-space-3); padding-left: 1.2em; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.add { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-3); }
.add :deep(.btn) { margin-left: -12px; }
@container (max-width: 520px) {
  .headrow { flex-direction: column; align-items: stretch; }
  .list li { flex-wrap: wrap; }
  .list li .txt { flex-basis: 100%; }
}
</style>
