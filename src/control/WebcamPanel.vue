<script setup lang="ts">
/**
 * Camera module for Control: one camera at a time, gallery style.
 * Arrows on the picture (and the keyboard's left/right keys) step through
 * the cameras; the dots show which one is showing. The choice is shared
 * with the Dashboard.
 */
import { computed } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import Icon from '@/icons/Icon.vue'
import WebcamView from '@/webcams/WebcamView.vue'
import { useWebcamsStore } from '@/stores/webcams'
import { useMachineStore } from '@/stores/machine'

const webcams = useWebcamsStore()
const machine = useMachineStore()
const count = computed(() => webcams.cameras.length)
const status = computed(() => {
  if (!webcams.current) return machine.online ? 'None set up' : '—'
  return count.value > 1 ? `${webcams.index + 1} of ${count.value}` : webcams.current.name
})

function onKey(e: KeyboardEvent) {
  if (count.value < 2) return
  if (e.key === 'ArrowLeft') webcams.show(-1)
  else if (e.key === 'ArrowRight') webcams.show(1)
  else return
  e.preventDefault()
}
</script>

<template>
  <RsPanel title="Camera" :status="status" flush>
    <div v-if="webcams.current" class="gallery" tabindex="0" aria-roledescription="carousel" :aria-label="`Cameras, showing ${webcams.current.name}`" @keydown="onKey">
      <WebcamView :key="webcams.current.uid" :cam="webcams.current">
        <span class="name">{{ webcams.current.name }}</span>
        <template v-if="count > 1">
          <button type="button" class="arrow prev" aria-label="Previous camera" @click="webcams.show(-1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>
          </button>
          <button type="button" class="arrow next" aria-label="Next camera" @click="webcams.show(1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" /></svg>
          </button>
          <div class="dots" role="tablist" aria-label="Choose a camera">
            <button
              v-for="(c, i) in webcams.cameras"
              :key="c.uid"
              type="button"
              role="tab"
              class="dot"
              :class="{ on: i === webcams.index }"
              :aria-selected="i === webcams.index"
              :aria-label="c.name"
              @click="webcams.choose(c.uid)"
            />
          </div>
        </template>
      </WebcamView>
    </div>

    <div v-else class="none">
      <Icon nav="camera" :size="28" />
      <p v-if="machine.online">
        No cameras yet. Add one in <RouterLink to="/settings">Settings</RouterLink>; cameras you set up in Mainsail show here too.
      </p>
      <p v-else>Cameras show once the machine is connected.</p>
    </div>
  </RsPanel>
</template>

<style scoped>
.gallery { position: relative; border-radius: 0 0 var(--rs-radius-lg) var(--rs-radius-lg); overflow: hidden; outline: none; }
.gallery:focus-visible { box-shadow: inset var(--rs-focus); }
.name {
  position: absolute;
  left: 14px;
  bottom: 12px;
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  color: var(--rs-overlay-text);
  text-shadow: var(--rs-overlay-shadow);
}
.arrow {
  position: absolute;
  top: 50%;
  translate: 0 -50%;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--rs-overlay-faint);
  background: var(--rs-overlay-button);
  color: var(--rs-overlay-text);
  cursor: pointer;
  opacity: 0.75;
  transition: opacity var(--rs-dur-fast, 120ms), background var(--rs-dur-fast, 120ms);
}
.arrow svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.arrow.prev { left: 12px; }
.arrow.next { right: 12px; }
.gallery:hover .arrow { opacity: 1; }
.arrow:hover { background: var(--rs-overlay-text); color: var(--rs-cam-bg); }
.arrow:focus-visible { opacity: 1; box-shadow: var(--rs-focus); }
.dots { position: absolute; left: 50%; bottom: 14px; translate: -50% 0; display: flex; gap: 2px; }
.dot { width: 18px; height: 18px; padding: 0; border: 0; background: transparent; cursor: pointer; display: grid; place-items: center; }
.dot::before { content: ''; width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--rs-overlay-text); box-shadow: var(--rs-overlay-shadow); }
.dot.on::before { background: var(--rs-overlay-text); }
.none { display: flex; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-5); color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.none a { color: var(--rs-text-strong); }
@media (hover: none) { .arrow { opacity: 1; } }
</style>
