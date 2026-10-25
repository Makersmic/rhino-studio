<script setup lang="ts">
/**
 * The red padlock: one lock toggle for every panel that can act on the machine
 * without asking each time (Motion, Speed, Flow). Filled red = locked; red
 * outline with an open shackle = unlocked and live (the panel turns red too,
 * RsPanel :live). Optional text after it, e.g. Motion's "42 s".
 */
defineProps<{ open: boolean; disabled?: boolean; label: string; text?: string }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="padlock"
    :class="{ open, wide: !!text }"
    :disabled="disabled"
    :aria-pressed="open"
    :aria-label="label"
    :title="label"
    @click="$emit('toggle')"
  >
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path v-if="open" d="M5 7V4.8a3 3 0 0 1 5.8-1.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <path v-else d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" />
    </svg>
    <span v-if="text" class="t">{{ text }}</span>
  </button>
</template>

<style scoped>
.padlock {
  height: 30px; min-width: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: var(--rs-radius-md); border: 1.5px solid var(--rs-danger);
  background: var(--rs-danger); color: var(--rs-on-danger); cursor: pointer; flex: none;
}
.padlock.wide { padding: 0 10px 0 8px; }
.padlock.open { background: transparent; color: var(--rs-danger); }
.padlock:hover:not(:disabled) { background: var(--rs-danger-strong); border-color: var(--rs-danger-strong); color: var(--rs-on-danger); }
.padlock:focus-visible { box-shadow: var(--rs-focus); outline: none; }
.padlock:disabled { opacity: 0.45; cursor: not-allowed; }
.t { font-family: var(--rs-font-code); font-size: 12px; font-weight: 600; }
</style>
