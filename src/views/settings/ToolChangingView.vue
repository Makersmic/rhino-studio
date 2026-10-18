<script setup lang="ts">
/** Settings / Tool changing: how this machine changes tools (the tool-change adapter). */
import './settings.css'
import RsPanel from '@/components/RsPanel.vue'
import { useSettingsStore } from '@/stores/settings'
import { useMachineStore } from '@/stores/machine'
import { ADAPTERS } from '@/tools/adapters'

const settings = useSettingsStore()
const machine = useMachineStore()
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="Tool changing" index="01" panel-id="settings.tools">
        <label class="field">
          <span>Tool changing</span>
          <select v-model="settings.toolAdapter">
            <option value="auto">Automatic{{ machine.online ? ` (found: ${machine.adapterPick.matched ? machine.adapter.label : 'nothing recognised'})` : '' }}</option>
            <option v-for="a in ADAPTERS" :key="a.id" :value="a.id">{{ a.label }}</option>
          </select>
        </label>
        <p class="muted small">
          {{ machine.adapter.about }}
          <template v-if="machine.online && !machine.adapterPick.matched">
            <strong class="warn-text">This machine doesn't look like {{ settings.toolAdapter === 'auto' ? 'any kind Studio knows' : machine.adapter.label }}, so the mounted tool can't be confirmed and jogging, tool power and jobs stay locked.</strong>
          </template>
        </p>
        <p class="muted small">
          <template v-if="machine.adapter.style === 'automatic'">
            This machine changes tools itself: jobs pick up the tools they use, and a job can start with no tool on the head.
          </template>
          <template v-else>
            On this machine you swap the tool yourself: a job only starts once the tool it needs is confirmed, and every swap is confirmed first.
          </template>
        </p>
        <label v-if="machine.adapter.style === 'automatic'" class="check">
          <input v-model="settings.confirmSwaps" type="checkbox" />
          Ask before tool changes I start from the Swap list
        </label>
        <p v-if="machine.adapter.style === 'automatic' && !settings.confirmSwaps" class="muted small">
          Picking a tool in Swap changes it straight away. Commands typed in the console still ask, and a tool-sensor mismatch still stops everything.
        </p>
      </RsPanel>
    </div>
  </div>
</template>
