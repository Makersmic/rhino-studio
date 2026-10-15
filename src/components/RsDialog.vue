<script setup lang="ts">
/**
 * One look for every small form that pops up: a title, the form, an error
 * line, and the buttons at the bottom (the primary one first). Esc and the
 * close button both cancel. The parent owns `open` and does the saving.
 */
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ open: boolean; title: string; kicker?: string; error?: string | null; wide?: boolean }>(), {
  kicker: '',
  error: null,
  wide: false,
})
const emit = defineEmits<{ close: []; submit: [] }>()
const dlg = ref<HTMLDialogElement | null>(null)
const uid = `dlg-${Math.random().toString(36).slice(2, 8)}`

watch(
  () => props.open,
  async (o) => {
    await nextTick()
    if (o && !dlg.value?.open) dlg.value?.showModal()
    if (!o && dlg.value?.open) dlg.value.close()
  },
  { immediate: true },
)
</script>

<template>
  <dialog ref="dlg" class="rsd" :class="{ wide }" :aria-labelledby="uid" @cancel.prevent="emit('close')">
    <form v-if="open" class="body" @submit.prevent="emit('submit')">
      <header class="head">
        <div class="tt">
          <span v-if="kicker" class="kick">{{ kicker }}</span>
          <h2 :id="uid">{{ title }}</h2>
        </div>
        <button type="button" class="x" aria-label="Close" @click="emit('close')">×</button>
      </header>
      <div class="main"><slot /></div>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <footer class="foot"><slot name="actions" /></footer>
    </form>
  </dialog>
</template>

<style scoped>
.rsd {
  width: min(560px, calc(100vw - 24px)); max-height: calc(100vh - 32px); padding: 0;
  border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text);
}
.rsd.wide { width: min(760px, calc(100vw - 24px)); }
.rsd::backdrop { background: rgb(0 0 0 / 0.5); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); padding: var(--rs-space-5) var(--rs-space-5) 0; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--rs-space-3); }
.tt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kick { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
h2 { margin: 0; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); line-height: 1.25; }
.x { width: 34px; height: 34px; flex: none; border-radius: 50%; border: 1px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-size: 20px; line-height: 1; cursor: pointer; }
.main { display: flex; flex-direction: column; gap: var(--rs-space-4); }
.err { margin: 0; padding: 8px 12px; border-radius: var(--rs-radius-md); border: 1.5px solid var(--rs-danger); color: var(--rs-danger); font-size: var(--rs-text-sm); }
.foot {
  position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2);
  margin: 0 calc(-1 * var(--rs-space-5)); padding: var(--rs-space-3) var(--rs-space-5) var(--rs-space-4);
  background: var(--rs-surface); border-top: 1px solid var(--rs-line);
}
</style>
