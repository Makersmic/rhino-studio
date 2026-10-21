<script setup lang="ts">
/**
 * A scrolling, terminal-style log for installs and updates (Settings › Software).
 * Shows every line it's given, keeps to the newest one while it's at the bottom,
 * and stops following as soon as you scroll up to read, so nothing jumps under
 * you. "Copy" puts the whole log on the clipboard to send for help.
 */
import { nextTick, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ lines: string[]; height?: number; label?: string }>(), { height: 240, label: 'Log' })
const box = ref<HTMLElement | null>(null)
const follow = ref(true)
const copied = ref(false)

function atBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 24
}
function onScroll() {
  if (box.value) follow.value = atBottom(box.value)
}
async function toEnd() {
  await nextTick()
  if (box.value) box.value.scrollTop = box.value.scrollHeight
  follow.value = true
}
watch(() => props.lines.length, () => follow.value && void toEnd())
onMounted(() => void toEnd())

async function copy() {
  try {
    await navigator.clipboard.writeText(props.lines.join('\n'))
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* select it by hand */
  }
}
</script>

<template>
  <div class="runlog">
    <div class="bar">
      <span class="lbl">{{ label }} · {{ lines.length }} {{ lines.length === 1 ? 'line' : 'lines' }}</span>
      <button v-if="!follow" type="button" class="lnk" @click="toEnd">Jump to newest</button>
      <button type="button" class="lnk" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
    </div>
    <pre ref="box" class="out" :style="{ maxHeight: `${height}px` }" tabindex="0" :aria-label="label" @scroll="onScroll">{{ lines.join('\n') }}</pre>
  </div>
</template>

<style scoped>
.runlog { margin-top: var(--rs-space-2); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); overflow: hidden; background: var(--rs-surface); }
.bar { display: flex; align-items: center; gap: var(--rs-space-3); padding: 4px 10px; border-bottom: 1px dotted var(--rs-line-strong); font-size: 11px; color: var(--rs-text-muted); }
.lbl { flex: 1; }
.lnk { padding: 0; border: 0; background: none; font: inherit; color: var(--rs-text-strong); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.out { margin: 0; padding: 8px 10px; overflow: auto; overscroll-behavior: contain; font-family: var(--rs-font-code); font-size: 11px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--rs-text); }
.out:focus-visible { outline: none; box-shadow: inset var(--rs-focus); }
</style>
