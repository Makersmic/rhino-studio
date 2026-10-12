<script setup lang="ts">
/**
 * The one button.
 *   primary  inverted ink: the main action on a card
 *   default  ink outline
 *   quiet    text only
 *   danger   red: stops or destroys something (red is reserved for this)
 */
withDefaults(
  defineProps<{ variant?: 'primary' | 'default' | 'quiet' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean; size?: 'md' | 'sm' }>(),
  { variant: 'default', type: 'button', disabled: false, size: 'md' },
)
</script>

<template>
  <button :type="type" class="btn" :class="[variant, size]" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--rs-space-2);
  min-height: 38px;
  padding: 0 var(--rs-space-4);
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong);
  background: transparent;
  color: var(--rs-text-strong);
  font-weight: var(--rs-weight-medium);
  font-size: var(--rs-text-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--rs-dur) var(--rs-ease), color var(--rs-dur) var(--rs-ease);
}
.btn.sm { min-height: 32px; padding: 0 var(--rs-space-3); }
.btn:hover:not(:disabled) { background: var(--rs-surface-2); }
.primary { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.primary:hover:not(:disabled) { background: var(--rs-text); }
.quiet { border-color: transparent; color: var(--rs-text); padding: 0 var(--rs-space-2); }
.quiet:hover:not(:disabled) { background: transparent; color: var(--rs-text-strong); text-decoration: underline; text-underline-offset: 4px; }
.danger { background: var(--rs-danger); border-color: var(--rs-danger); color: var(--rs-on-danger); }
.danger:hover:not(:disabled) { background: var(--rs-danger-strong); }
.btn:disabled { cursor: not-allowed; opacity: 0.35; }
</style>
