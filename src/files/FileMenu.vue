<script setup lang="ts">
/**
 * The row menu for Files: right-click on a PC, long-press on a phone, or the
 * row's ⋯ button. Items that can't be used say why in a small line under them.
 * Delete is last, outlined red, and always confirms (the parent does that).
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export interface MenuItem {
  label: string
  run: () => void
  danger?: boolean
  /** set = greyed out, with this reason under it */
  block?: string | null
}
const props = defineProps<{ x: number; y: number; title: string; items: MenuItem[] }>()
const emit = defineEmits<{ close: [] }>()
const el = ref<HTMLDivElement | null>(null)
const pos = ref({ left: props.x, top: props.y })

onMounted(async () => {
  await nextTick()
  const r = el.value?.getBoundingClientRect()
  if (r) {
    // keep the whole menu on screen
    pos.value = { left: Math.max(8, Math.min(props.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(props.y, window.innerHeight - r.height - 8)) }
  }
  ;(el.value?.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus()
  setTimeout(() => window.addEventListener('pointerdown', outside), 0)
  window.addEventListener('keydown', onKey)
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', outside)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
})
const close = () => emit('close')
function outside(e: PointerEvent) {
  if (!el.value?.contains(e.target as Node)) close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const btns = [...(el.value?.querySelectorAll('button:not(:disabled)') ?? [])] as HTMLButtonElement[]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length]?.focus()
  }
}
function pick(it: MenuItem) {
  if (it.block) return
  close()
  it.run()
}
</script>

<template>
  <div ref="el" class="menu" role="menu" :aria-label="`Actions for ${title}`" :style="{ left: `${pos.left}px`, top: `${pos.top}px` }">
    <p class="head">{{ title }}</p>
    <button
      v-for="it in items"
      :key="it.label"
      type="button"
      role="menuitem"
      class="it"
      :class="{ danger: it.danger }"
      :disabled="!!it.block"
      @click="pick(it)"
    >
      <span>{{ it.label }}</span>
      <span v-if="it.block" class="why">{{ it.block }}</span>
    </button>
  </div>
</template>

<style scoped>
.menu { position: fixed; z-index: 70; min-width: 200px; max-width: 280px; padding: 6px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md, 10px); background: var(--rs-surface); box-shadow: 0 10px 30px rgb(0 0 0 / 0.22); }
.head { margin: 2px 8px 6px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.it { display: flex; flex-direction: column; align-items: flex-start; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; background: none; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); text-align: left; cursor: pointer; }
.it:hover:not(:disabled), .it:focus-visible { background: var(--rs-surface-2); outline: none; }
.it:disabled { color: var(--rs-text-muted); cursor: not-allowed; }
.it .why { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
/* Delete: outlined red, set apart from the everyday items */
.it.danger { margin-top: 6px; border: 1px solid var(--rs-danger); color: var(--rs-danger); }
.it.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--rs-danger) 10%, transparent); }
.it.danger:disabled { border-color: var(--rs-line); }
</style>
