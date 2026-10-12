<script setup lang="ts">
/**
 * Shows the question a Rhino wizard is asking (the same one Mainsail shows).
 * Pressing a button runs that button's own command, nothing else.
 * Not modal: you can still reach Stop and the console while it's open.
 */
import { computed } from 'vue'
import { useControlStore } from '@/stores/control'
import type { PromptButton } from './prompts'

const control = useControlStore()
const p = computed(() => control.prompt)
const tone = (b: PromptButton) => (b.color === 'error' ? 'stop' : b.color === 'primary' || b.color === 'success' ? 'go' : b.color === 'warning' ? 'warn' : 'plain')
</script>

<template>
  <section v-if="p" class="prompt" role="dialog" aria-live="assertive" :aria-label="p.title">
    <header class="head">
      <span class="from">Klipper asks</span>
      <h2>{{ p.title }}</h2>
    </header>
    <div class="items">
      <template v-for="(it, i) in p.items" :key="i">
        <p v-if="'text' in it" class="text">{{ it.text }}</p>
        <div v-else class="group">
          <button
            v-for="b in it.group"
            :key="b.label + b.command"
            type="button"
            class="btn"
            :class="tone(b)"
            :disabled="control.promptBusy"
            :title="b.command"
            @click="control.pressPromptButton(b)"
          >
            {{ b.label }}
          </button>
        </div>
      </template>
    </div>
    <footer v-if="p.footer.length" class="footer">
      <button
        v-for="b in p.footer"
        :key="b.label + b.command"
        type="button"
        class="btn"
        :class="tone(b)"
        :disabled="control.promptBusy"
        :title="b.command"
        @click="control.pressPromptButton(b)"
      >
        {{ b.label }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.prompt {
  position: fixed;
  z-index: 40;
  right: var(--rs-space-4);
  bottom: var(--rs-space-4);
  width: min(440px, calc(100vw - 24px));
  max-height: calc(100vh - var(--rs-topbar-h) - 32px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  color: var(--rs-text);
  border: 2px solid var(--rs-ink);
  box-shadow: 0 18px 48px rgb(0 0 0 / 0.4);
}
.head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--rs-space-3) var(--rs-space-5);
  background: var(--rs-ink);
  color: var(--rs-on-ink);
}
.from { font-size: var(--rs-text-xs); opacity: 0.7; }
h2 { color: inherit; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); }
.items { display: flex; flex-direction: column; gap: var(--rs-space-2); padding: var(--rs-space-4) var(--rs-space-5); }
.text { font-size: var(--rs-text-md); }
.group, .footer { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); }
.footer { padding: var(--rs-space-3) var(--rs-space-5) var(--rs-space-4); background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 0 / 5px 2px repeat-x; }
.btn {
  min-height: 40px;
  padding: 0 var(--rs-space-4);
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong);
  background: transparent;
  color: var(--rs-text-strong);
  font-weight: var(--rs-weight-medium);
  cursor: pointer;
  text-align: left;
}
.btn:hover:not(:disabled) { background: var(--rs-surface-2); }
.btn.go { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.btn.stop { background: var(--rs-danger); border-color: var(--rs-danger); color: var(--rs-on-danger); }
.btn.warn { border-width: 2px; border-color: var(--rs-ink); }
.btn:disabled { opacity: 0.5; cursor: wait; }
@media (max-width: 720px) { .prompt { bottom: 84px; right: 12px; } }
</style>
