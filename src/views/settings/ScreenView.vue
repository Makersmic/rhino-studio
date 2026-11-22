<script setup lang="ts">
/** Settings / Appearance / This screen: how this browser shows the 3D view and the cameras. Not part of a theme. */
import { useSettingsStore } from '@/stores/settings'
import './settings.css'
import RsPanel from '@/components/RsPanel.vue'
import { CAM_ZOOM } from '@/webcams/webcams'

const settings = useSettingsStore()
const camPlaces = [
  { key: 'camDashboard', label: 'Dashboard' },
  { key: 'camControl', label: 'Control' },
] as const
</script>

<template>
  <div class="set-page">
    <p class="scope muted small">These are kept in this browser only. Another screen, such as the kiosk, has its own.</p>
    <div class="grid">
      <RsPanel title="3D view" index="01" panel-id="settings.screen">
        <label class="field plate">
          <span>Build plate seen from below: {{ settings.plateSeeThrough }} % see-through</span>
          <input v-model.number="settings.plateSeeThrough" type="range" min="0" max="100" step="5" aria-label="How see-through the build plate is from below" />
        </label>
        <p class="muted small">In Job setup, turn the view to look under a part: the white plate lets you see its underside and the support marks there. 0 % keeps it solid. Kept in this browser only.</p>

      </RsPanel>
      <RsPanel title="Cameras" index="02" panel-id="settings.screen.cameras">
        <div class="cams">
          <fieldset v-for="c in camPlaces" :key="c.key" class="cam-set">
            <legend>{{ c.label }}</legend>
            <div class="segmented" role="radiogroup" :aria-label="`${c.label} camera fit`">
              <label class="seg"><input v-model="settings[c.key].fit" type="radio" :name="`fit-${c.key}`" value="cover" class="visually-hidden" /><span>Fill the box</span></label>
              <label class="seg"><input v-model="settings[c.key].fit" type="radio" :name="`fit-${c.key}`" value="contain" class="visually-hidden" /><span>Whole picture</span></label>
            </div>
            <label class="field">
              <span>Zoom: {{ settings[c.key].zoom }} %</span>
              <input v-model.number="settings[c.key].zoom" type="range" :min="CAM_ZOOM.min" :max="CAM_ZOOM.max" :step="CAM_ZOOM.step" :aria-label="`${c.label} camera zoom`" />
            </label>
            <button v-if="settings[c.key].zoom !== 100 || settings[c.key].fit !== 'cover'" type="button" class="link" @click="settings[c.key] = { fit: 'cover', zoom: 100 }">Reset</button>
          </fieldset>
        </div>
        <p class="muted small">Fill the box crops the picture's edges to fit the screen's shape, so the Dashboard and Control can look zoomed differently; Whole picture shows all of it with bars. Zoom enlarges from the middle. Kept in this browser only.</p>

      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.scope { margin: 0 0 var(--rs-space-3); }
.plate { display: flex; flex-direction: column; gap: 6px; max-width: 420px; }
.cams { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--rs-space-4); max-width: 640px; }
.cam-set { display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-2); margin: 0; padding: 0; border: 0; min-width: 0; }
.cam-set legend { padding: 0; margin-bottom: var(--rs-space-2); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.cam-set .segmented { margin: 0; }
.cam-set .field { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.cam-set .field > span { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.cam-set input[type='range'] { width: 100%; accent-color: var(--rs-text-strong); }
.plate input[type='range'] { width: 100%; }
</style>
