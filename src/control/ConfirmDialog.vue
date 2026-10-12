<script setup lang="ts">
/**
 * The one confirmation dialog. Says what will happen, lists the commands and
 * what each does, and defaults focus to Cancel so Enter never fires a move.
 */
import { nextTick, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useControlStore } from '@/stores/control'

const control = useControlStore()
const dlg = ref<HTMLDialogElement | null>(null)
const cancelBtn = ref<HTMLElement | null>(null)

watch(
  () => control.pendingConfirm,
  async (req) => {
    if (!req) {
      if (dlg.value?.open) dlg.value.close()
      return
    }
    await nextTick()
    if (!dlg.value?.open) dlg.value?.showModal()
    ;(cancelBtn.value?.querySelector('button') ?? cancelBtn.value)?.focus()
  },
)

const answer = (ok: boolean) => control.pendingConfirm?.resolve(ok)
</script>

<template>
  <dialog ref="dlg" class="dlg" :class="control.pendingConfirm?.tone" aria-labelledby="confirm-title" @cancel.prevent="answer(false)">
    <div v-if="control.pendingConfirm" class="body">
      <span class="mark" aria-hidden="true" />
      <h2 id="confirm-title">{{ control.pendingConfirm.title }}</h2>
      <p class="text">{{ control.pendingConfirm.body }}</p>
      <ul v-if="control.pendingConfirm.lines?.length" class="lines">
        <li v-for="(l, i) in control.pendingConfirm.lines" :key="i">
          <code>{{ l.text }}</code>
          <span v-if="l.reason">{{ l.reason }}</span>
        </li>
      </ul>
      <footer class="actions">
        <RsButton :variant="control.pendingConfirm.tone === 'danger' ? 'danger' : 'primary'" @click="answer(true)">
          {{ control.pendingConfirm.confirmLabel }}
        </RsButton>
        <span ref="cancelBtn"><RsButton @click="answer(false)">Cancel</RsButton></span>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(540px, calc(100vw - 24px));
  padding: 0;
  border: 0;
  border-radius: var(--rs-radius-xl);
  background: var(--rs-surface);
  color: var(--rs-text);
  box-shadow: 0 0 0 4px var(--rs-warn-fill);
}
.dlg.danger { box-shadow: 0 0 0 4px var(--rs-danger); }
.dlg.normal { box-shadow: none; }
.dlg::backdrop { background: rgb(0 0 0 / 0.65); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); padding: var(--rs-space-5); }
.mark { width: 14px; height: 14px; background: var(--rs-warn-fill); transform: rotate(45deg); }
.danger .mark { background: var(--rs-danger); transform: none; }
h2 { font-size: var(--rs-text-xl); font-weight: var(--rs-weight-body); letter-spacing: -0.02em; }
.text { white-space: pre-line; }
.lines { list-style: none; margin: 0; padding: var(--rs-space-3) var(--rs-space-4); border-radius: var(--rs-radius-md); background: var(--rs-bg); display: flex; flex-direction: column; gap: var(--rs-space-2); }
.lines li { display: flex; flex-direction: column; gap: 2px; }
.lines code { color: var(--rs-text-strong); overflow-wrap: anywhere; }
.lines span { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.actions { display: flex; gap: var(--rs-space-2); }
</style>
