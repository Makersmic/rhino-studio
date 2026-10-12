<script setup lang="ts">
/**
 * Console with macro buttons beside it.
 * Typed commands and buttons go through the same safety check: moves, tool
 * power, tool-state changes, restarts and internal macros ask first.
 */
import { computed, nextTick, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { macroGroups } from './macroGroups'

const control = useControlStore()
const machine = useMachineStore()

const input = ref('')
const history = ref<string[]>([])
let histPos = -1
const logEl = ref<HTMLElement | null>(null)
const stick = ref(true)

const groups = computed(() =>
  macroGroups(new Set(control.macros.keys()), {
    toolType: machine.toolState.kind === 'mounted' ? machine.toolState.type : null,
    toolName: machine.mountedName,
    needsRestore: machine.toolState.kind === 'none-confirmed' && !!machine.toolState.lastSavedSlot,
  }),
)
const suggestions = computed(() => [...control.help.keys()].sort())

async function submit() {
  const text = input.value.trim()
  if (!text) return
  history.value = [text, ...history.value.filter((h) => h !== text)].slice(0, 50)
  histPos = -1
  input.value = ''
  stick.value = true
  await control.send(text)
}

function recall(dir: 1 | -1) {
  histPos = Math.max(-1, Math.min(history.value.length - 1, histPos + dir))
  input.value = histPos < 0 ? '' : history.value[histPos]!
}

function onScroll() {
  const el = logEl.value
  if (el) stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}
watch(
  () => control.lines.length,
  async () => {
    if (!stick.value) return
    await nextTick()
    logEl.value?.scrollTo({ top: logEl.value.scrollHeight })
  },
)

const runMacro = (name: string, label: string) => control.send(name, { label })
const fmtTime = (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
</script>

<template>
  <RsPanel title="Console and macros" index="05">
    <div class="wrap">
      <aside class="macros" aria-label="Macros">
        <section v-for="g in groups" :key="g.title" class="group">
          <h3>{{ g.title }}</h3>
          <div class="buttons" :class="{ dense: g.title === 'Other macros' }">
            <button
              v-for="b in g.buttons"
              :key="b.name"
              type="button"
              class="macro"
              :class="{ suggested: b.suggested }"
              :disabled="!machine.klippyReady"
              :title="control.macros.get(b.name) || b.name"
              @click="runMacro(b.name, b.label)"
            >
              {{ b.label }}
            </button>
          </div>
        </section>
        <p v-if="!groups.length" class="muted small">Macros appear when Klipper is connected.</p>
      </aside>

      <div class="console">
        <div ref="logEl" class="log" role="log" aria-live="polite" @scroll="onScroll">
          <div v-for="l in control.lines" :key="l.id" class="line" :class="l.kind">
            <time>{{ fmtTime(l.time) }}</time>
            <span>{{ l.kind === 'sent' ? '› ' : '' }}{{ l.text }}</span>
          </div>
        </div>
        <form class="input" @submit.prevent="submit">
          <input
            v-model="input"
            type="text"
            list="rs-commands"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="G-code or macro, e.g. M105 or SWAP_TOOL"
            aria-label="Command"
            :disabled="!machine.online"
            @keydown.up.prevent="recall(1)"
            @keydown.down.prevent="recall(-1)"
          />
          <datalist id="rs-commands"><option v-for="s in suggestions" :key="s" :value="s" /></datalist>
          <RsButton type="submit" :disabled="!machine.online || !input.trim()">Send</RsButton>
        </form>
        <p class="note">
          <span v-if="control.running">Running {{ control.running }}… </span>
          Moves, tool power, tool-state changes and restarts ask before they're sent. The ↑ key recalls earlier commands.
        </p>
      </div>
    </div>
  </RsPanel>
</template>

<style scoped>
.wrap { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: var(--rs-space-5); }
.macros { display: flex; flex-direction: column; gap: var(--rs-space-4); max-height: 520px; overflow: auto; padding-right: 4px; }
h3 { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); margin-bottom: var(--rs-space-2); }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.macro {
  min-height: 36px;
  padding: 0 14px;
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--rs-line-strong);
  background: transparent;
  color: var(--rs-text-strong);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  cursor: pointer;
}
.macro:hover:not(:disabled) { border-color: var(--rs-text-strong); }
.macro.suggested { background: var(--rs-warn-fill); border-color: transparent; color: var(--th-ink); }
.macro:disabled { opacity: 0.4; cursor: not-allowed; }
.dense .macro { min-height: 30px; font-family: var(--rs-font-code); font-size: var(--rs-text-xs); font-weight: 400; }

.console { display: flex; flex-direction: column; gap: var(--rs-space-2); min-width: 0; }
.log {
  height: 420px;
  overflow: auto;
  padding: var(--rs-space-3) var(--rs-space-4);
  border-radius: var(--rs-radius-md);
  background: var(--rs-bg);
  font-family: var(--rs-font-code);
  font-size: 12.5px;
  line-height: 1.55;
}
.line { display: grid; grid-template-columns: 70px 1fr; gap: var(--rs-space-3); }
.line time { color: var(--rs-text-muted); opacity: 0.7; }
.line span { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--rs-text); }
.line.sent span { color: var(--rs-text-strong); }
.line.action span { color: var(--rs-active); }
.line.error span { color: var(--rs-danger-strong); }
.line.note span { color: var(--rs-text-muted); font-style: italic; }
.input { display: flex; gap: var(--rs-space-2); }
.input input { flex: 1; min-width: 0; height: 44px; padding: 0 var(--rs-space-4); border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); background: var(--rs-bg); color: var(--rs-text-strong); font-family: var(--rs-font-code); }
.input input:focus-visible { border-color: var(--rs-text-strong); }
.note { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.small { font-size: var(--rs-text-sm); }
@media (max-width: 900px) { .wrap { grid-template-columns: 1fr; } .macros { max-height: none; } .log { height: 300px; } }
</style>
