<script setup lang="ts">
import RsPanel from '@/components/RsPanel.vue'
import { useThemeStore, type ThemePref } from '@/stores/theme'
import { brand } from '@/brand/brand'

const theme = useThemeStore()
const options: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Settings</h1>
    </div>

    <div class="grid">
      <RsPanel title="Appearance" index="01">
        <fieldset class="segmented">
          <legend class="visually-hidden">Theme</legend>
          <label v-for="o in options" :key="o.value" class="seg">
            <input v-model="theme.pref" type="radio" name="theme" :value="o.value" class="visually-hidden" />
            <span>{{ o.label }}</span>
          </label>
        </fieldset>
        <p class="muted small">Saved in this browser only.</p>
      </RsPanel>

      <RsPanel title="Machine" index="02">
        <label class="field">
          <span>Moonraker address</span>
          <input type="text" placeholder="http://rhino.local" disabled />
        </label>
        <p class="muted small">Editable in Phase 2.</p>
      </RsPanel>

      <RsPanel title="About" index="03">
        <p>{{ brand.name }} {{ brand.version }}</p>
        <p class="muted small">For the {{ brand.machine }}. Free software under GPL-3.0-or-later.</p>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.segmented { border: 0; margin: 0 0 var(--rs-space-3); padding: 4px; display: inline-flex; gap: 4px; border-radius: var(--rs-radius-pill); background: var(--rs-bg); }
.seg span { display: inline-flex; align-items: center; height: 36px; padding: 0 var(--rs-space-4); border-radius: var(--rs-radius-pill); cursor: pointer; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.seg input:checked + span { background: var(--rs-paper); color: var(--rs-paper-ink); }
.seg input:focus-visible + span { box-shadow: var(--rs-focus); }
.field { display: flex; flex-direction: column; gap: var(--rs-space-1); font-size: var(--rs-text-sm); margin-bottom: var(--rs-space-2); }
.field input { height: 42px; padding: 0 var(--rs-space-4); border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); background: transparent; }
.field input:disabled { opacity: 0.5; }
.small { font-size: var(--rs-text-sm); }
</style>
