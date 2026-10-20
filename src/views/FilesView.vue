<script setup lang="ts">
/**
 * Files: Moonraker's folders as tabs. Gcode files (jobs: toolhead, last run,
 * Start), Config (Klipper's config folder, editable), Logs (read-only) and
 * Job history. Each folder tab is a FileBrowser (src/files/FileBrowser.vue),
 * which holds the safety rules. The tab is kept in the address (?tab=).
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import RsPanel from '@/components/RsPanel.vue'
import Icon from '@/icons/Icon.vue'
import FileBrowser from '@/files/FileBrowser.vue'
import JobHistory from '@/files/JobHistory.vue'
import { useMachineStore } from '@/stores/machine'
import type { Root } from '@/files/fileOps'

type Tab = Root | 'history'
const TABS: [Tab, string][] = [['gcodes', 'Gcode files'], ['config', 'Config'], ['logs', 'Logs'], ['history', 'Job history']]
const LEAD: Record<Tab, string> = {
  gcodes: 'Jobs on the Rhino: the toolhead each one asks for (green when it’s the mounted one), how it last ran, and a ring on the ones never run. Start checks the file against the mounted toolhead.',
  config: 'Klipper’s config folder. Saving keeps a copy of the file as it was (in studio_backups) and never restarts Klipper by itself.',
  logs: 'Klipper and Moonraker logs, read-only. Settings › Logs finds the last error in them.',
  history: 'Every job Moonraker has kept, newest first. Reprint checks the toolhead like Start does.',
}

const machine = useMachineStore()
const route = useRoute()
const router = useRouter()
const tab = computed<Tab>(() => {
  const t = route.query.tab
  return t === 'config' || t === 'logs' || t === 'history' ? t : 'gcodes'
})
function pick(t: Tab) {
  if (t !== tab.value) void router.push({ query: { tab: t === 'gcodes' ? undefined : t } })
}
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Files</h1>
      <p>{{ LEAD[tab] }}</p>
    </div>

    <div class="tabs" role="tablist" aria-label="Files">
      <button v-for="[k, l] in TABS" :key="k" type="button" role="tab" :aria-selected="tab === k" :class="{ on: tab === k }" @click="pick(k)">{{ l }}</button>
    </div>

    <EmptyState v-if="!machine.online" title="Connect to see the files on the Rhino">
      <template #art><Icon nav="files" :size="64" /></template>
      The lists come from Moonraker's folders: G-code, config and logs. Nothing outside them is shown or changed.
    </EmptyState>

    <RsPanel v-else :panel-id="`files.${tab}`" :title="TABS.find(([k]) => k === tab)![1]">
      <template v-if="tab === 'logs'" #actions>
        <RouterLink to="/settings/logs" class="link">Last error in Settings › Logs</RouterLink>
      </template>
      <JobHistory v-if="tab === 'history'" />
      <FileBrowser v-else :key="tab" :root="tab" />
    </RsPanel>
  </div>
</template>

<style scoped>
.tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: var(--rs-space-4); border-bottom: 1px solid var(--rs-line-strong); }
.tabs button { padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--rs-text-muted); font: inherit; font-size: var(--rs-text-sm); cursor: pointer; margin-bottom: -1px; }
.tabs button.on { color: var(--rs-text-strong); border-bottom-color: var(--rs-ink); font-weight: var(--rs-weight-medium); }
.link { font-size: var(--rs-text-sm); color: var(--rs-text-strong); text-underline-offset: 3px; }
</style>
