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
      <!-- One plain item (the tool being swapped to) replaces the command list;
           the command is still in the tooltip and in the console log. -->
      <div v-if="control.pendingConfirm.feature" class="feature" :title="control.pendingConfirm.lines?.map((l) => l.text).join('\n')">
        {{ control.pendingConfirm.feature }}
      </div>
      <ul v-else-if="control.pendingConfirm.lines?.length" class="lines">
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
  width: min(520px, calc(100vw - 24px));
  padding: 0;
  border: 2px solid var(--rs-ink);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  color: var(--rs-text);
}
.dlg.danger { border-color: var(--rs-danger); }
.dlg.normal { border-color: var(--rs-line-strong); }
.dlg::backdrop { background: rgb(0 0 0 / 0.55); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); padding: var(--rs-space-5); }
.mark { width: 14px; height: 14px; background: var(--rs-dither-dense); box-shadow: inset 0 0 0 1.5px var(--rs-ink); }
.danger .mark { background: var(--rs-danger); box-shadow: none; }
h2 { font-size: var(--rs-text-xl); font-weight: var(--rs-weight-body); letter-spacing: -0.02em; }
.text { white-space: pre-line; }
.lines { list-style: none; margin: 0; padding: var(--rs-space-3) var(--rs-space-4); border-radius: var(--rs-radius-md); background: var(--rs-surface-2); display: flex; flex-direction: column; gap: var(--rs-space-2); }
.feature {
  padding: var(--rs-space-3) var(--rs-space-4);
  border-radius: var(--rs-radius-md);
  background: var(--rs-surface-2);
  color: var(--rs-text-strong);
  font-size: 1.65rem; /* 26.4px: twice the command text (13.2px) */
  font-weight: var(--rs-weight-medium);
  line-height: 1.15;
  text-align: left;
  overflow-wrap: anywhere;
}
.lines li { display: flex; flex-direction: column; gap: 2px; }
.lines code { color: var(--rs-text-strong); overflow-wrap: anywhere; }
.lines span { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.actions { display: flex; gap: var(--rs-space-2); }
</style>
