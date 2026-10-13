<script setup lang="ts">
/**
 * Swap, in the top bar. Clicking it drops an orange list of the toolheads
 * Klipper knows (built-in and custom, from tool_mapping), minus the one
 * that's mounted.
 *
 * Picking one sends the machine's own swap command, from its tool-change
 * adapter (Rhino: `SWAP_TOOL TOOL=<slot>`, which cools down, parks and walks
 * you through the change; klipper-toolchanger: `SELECT_TOOL T=<n>`).
 * It goes through the safety check like everything else, so the confirmation
 * dialog says the machine will cool down and move before anything is sent.
 * Studio never sets the mounted tool itself: Klipper records it when the swap
 * is confirmed.
 *
 * Not offered while a job runs (the macro refuses too). If Klipper lists no
 * tools, Swap opens the macro's own picker instead.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '@/icons/Icon.vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'

const machine = useMachineStore()
const control = useControlStore()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const items = ref<HTMLButtonElement[]>([])

// Not during a job, a swap already under way, or while a tool sensor disagrees
const disabled = computed(() => !machine.klippyReady || control.jobActive || machine.toolState.kind === 'swapping' || machine.toolState.kind === 'mismatch')
const choices = computed(() => machine.knownTools.filter((t) => t.slot !== machine.mountedSlot))
const typeText: Record<string, string> = {
  DEPOSITION: 'Print head',
  LASER: 'Laser',
  CNC: 'Spindle',
  DRAG_KNIFE: 'Drag knife',
  POWERED: 'Powered tool',
  PASSIVE: 'Passive tool',
}

function toggle() {
  if (disabled.value) return
  if (!choices.value.length) {
    // nothing to list: let the machine's own picker ask, if it has one
    const picker = machine.adapter.pickerScript
    if (picker) control.send(picker, { label: 'Swap toolhead' })
    return
  }
  open.value = !open.value
}

function pick(slot: number, name: string) {
  open.value = false
  control.swapTo(slot, name)
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  const list = items.value
  const i = list.indexOf(document.activeElement as HTMLButtonElement)
  if (e.key === 'Escape') {
    open.value = false
    root.value?.querySelector<HTMLButtonElement>('.swap')?.focus()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    list[(i + 1) % list.length]?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    list[(i - 1 + list.length) % list.length]?.focus()
  }
}
function onOutside(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}

watch(open, async (o) => {
  if (o) {
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('keydown', onKey)
    await nextTick()
    items.value[0]?.focus()
  } else {
    document.removeEventListener('pointerdown', onOutside)
    document.removeEventListener('keydown', onKey)
  }
})
// a job starting or Klipper dropping closes the list
watch(disabled, (d) => { if (d) open.value = false })
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="swap-wrap">
    <button
      type="button"
      class="swap"
      :class="{ open }"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="control.jobActive ? 'Not while a job is running' : machine.toolState.kind === 'mismatch' ? 'Not while the tool sensor disagrees' : 'Swap the toolhead'"
      @click="toggle"
    >
      Swap
      <svg class="caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>

    <div v-if="open" class="menu" role="menu" aria-label="Swap to">
      <p class="head">Swap to</p>
      <button
        v-for="t in choices"
        :key="t.slot"
        ref="items"
        type="button"
        role="menuitem"
        class="item"
        @click="pick(t.slot, t.name)"
      >
        <span class="ic"><Icon :tool="t.look.icon" :size="22" /></span>
        <span class="txt">
          <strong>{{ t.name }}</strong>
          <small>{{ machine.adapter.slotWord }} {{ t.slot }}<template v-if="t.type"> · {{ typeText[t.type] ?? t.type }}</template></small>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.swap-wrap { position: relative; flex: none; margin-left: calc(-1 * var(--rs-space-2)); }
.swap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px 0 12px;
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong);
  background: transparent;
  color: var(--rs-text-strong);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  cursor: pointer;
}
.swap:hover:not(:disabled) { background: var(--rs-surface-2); }
.swap.open, .swap.open:hover:not(:disabled) { background: var(--rs-swap-menu); border-color: var(--rs-swap-menu); color: var(--rs-on-swap-menu); }
.swap:disabled { opacity: 0.35; cursor: not-allowed; }
.caret { transition: transform 0.12s; }
.swap.open .caret { transform: rotate(180deg); }

/* The one orange thing in the app: the swap list (see tokens.css) */
.menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  width: 260px;
  max-width: calc(100vw - 24px);
  padding: 6px;
  border-radius: var(--rs-radius-md);
  background: var(--rs-swap-menu);
  color: var(--rs-on-swap-menu);
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.28);
}
.head { margin: 0; padding: 6px 8px; font-size: 11px; font-weight: var(--rs-weight-medium); opacity: 0.8; }
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--rs-radius-sm);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.item:hover, .item:focus-visible { background: var(--rs-on-swap-menu); color: var(--rs-swap-menu); outline: none; }
.ic { display: grid; place-items: center; width: 30px; height: 30px; flex: none; }
.txt { display: flex; flex-direction: column; min-width: 0; }
.txt strong { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); }
.txt small { font-size: 11px; opacity: 0.8; }

@media (max-width: 720px) {
  .swap-wrap { margin-left: 0; }
  .swap { padding: 0 8px 0 10px; }
}
@media (max-width: 560px) {
  /* phone: open under the bar, clear of the screen edge */
  .menu { position: fixed; top: calc(var(--rs-topbar-h) + 4px); left: 12px; right: 12px; width: auto; }
}
</style>
