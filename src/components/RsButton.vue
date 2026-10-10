<script setup lang="ts">
/**
 * The one button. Pill-shaped. Variants:
 *   primary  - the main action on a screen (fills with the mounted tool's accent)
 *   default  - outlined
 *   quiet    - text only
 *   danger   - stops or destroys something (red is reserved for this)
 */
withDefaults(
  defineProps<{
    variant?: 'primary' | 'default' | 'quiet' | 'danger'
    type?: 'button' | 'submit'
    disabled?: boolean
  }>(),
  { variant: 'default', type: 'button', disabled: false },
)
</script>

<template>
  <button :type="type" class="btn" :class="variant" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--rs-space-2);
  min-height: 42px;
  padding: 0 var(--rs-space-5);
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--rs-line-strong);
  background: transparent;
  color: var(--rs-text-strong);
  font-weight: var(--rs-weight-medium);
  cursor: pointer;
  transition: background var(--rs-dur) var(--rs-ease), border-color var(--rs-dur) var(--rs-ease), color var(--rs-dur) var(--rs-ease);
}
.btn:hover:not(:disabled) { border-color: var(--rs-text-strong); }

.primary { background: var(--rs-active); border-color: transparent; color: var(--th-ink); }
.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--rs-active) 85%, white); border-color: transparent; }

.quiet { border-color: transparent; color: var(--rs-text); padding: 0 var(--rs-space-3); }
.quiet:hover:not(:disabled) { border-color: transparent; color: var(--rs-text-strong); text-decoration: underline; text-underline-offset: 4px; }

.danger { background: var(--rs-danger); border-color: transparent; color: var(--rs-on-danger); }
.danger:hover:not(:disabled) { background: var(--rs-danger-strong); border-color: transparent; }

.btn:disabled { cursor: not-allowed; opacity: 0.4; }
</style>
