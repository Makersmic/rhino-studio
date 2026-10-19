<script setup lang="ts">
/**
 * Every PrusaSlicer option, laid out the way PrusaSlicer does it:
 *   Print / Filament / Printer   (tabs)
 *   pages (Layers and perimeters, Infill, ...) and their groups
 *   Simple / Advanced / Expert   (which options show, as in PrusaSlicer)
 * plus search across all of them. Pages and groups that don't apply to a
 * one-extruder Klipper machine, and G-code the Rhino writes itself, are left
 * out; options the Rhino sets show locked, with why (src/slicer/prusa/config.ts).
 */
import { computed, ref, watch } from 'vue'
import PrusaOption from './PrusaOption.vue'
import { LOCKS, MODE_RANK, shownGroup, shownPage, staleChanges, type Mode, type RhinoCtx, type Schema } from '@/slicer/prusa/config'

const props = defineProps<{ schema: Schema; ctx: RhinoCtx }>()
const emit = defineEmits<{ (e: 'set', key: string, value: string | null): void; (e: 'resetAll'): void }>()

function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k)
    return v === null ? d : (JSON.parse(v) as T)
  } catch {
    return d
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* private window */
  }
}

const mode = ref<Mode>(load('rs.prusa.mode', 'simple'))
const tabId = ref<string>(load('rs.prusa.tab', 'print'))
const pageByTab = ref<Record<string, string>>(load('rs.prusa.pages', {}))
const query = ref('')
watch(mode, (v) => save('rs.prusa.mode', v))
watch(tabId, (v) => save('rs.prusa.tab', v))
watch(pageByTab, (v) => save('rs.prusa.pages', v), { deep: true })

const visible = (k: string) => {
  const d = props.schema.options[k]
  return !!d && MODE_RANK[d.mode] <= MODE_RANK[mode.value]
}
const tabs = computed(() =>
  props.schema.tabs.map((t) => ({
    ...t,
    pages: t.pages
      .filter((p) => shownPage(p.label))
      .map((p) => ({ ...p, groups: p.groups.filter((g) => shownGroup(g.label)).map((g) => ({ ...g, options: g.options.filter(visible) })).filter((g) => g.options.length) }))
      .filter((p) => p.groups.length),
  })),
)
const tab = computed(() => tabs.value.find((t) => t.id === tabId.value) ?? tabs.value[0]!)
const page = computed(() => tab.value.pages.find((p) => p.label === pageByTab.value[tab.value.id]) ?? tab.value.pages[0])
const changed = computed(() => Object.keys(props.ctx.job.prusa ?? {}).filter((k) => props.schema.options[k] && !LOCKS[k]))
const changedOn = (keys: string[]) => keys.filter((k) => changed.value.includes(k)).length
const pageChanged = (p: { groups: { options: string[] }[] }) => changedOn(p.groups.flatMap((g) => g.options))
const stale = computed(() => staleChanges(props.schema, props.ctx.job))
const counts = computed(() => {
  const all = props.schema.tabs.flatMap((t) => t.pages.filter((p) => shownPage(p.label)).flatMap((p) => p.groups.filter((g) => shownGroup(g.label)).flatMap((g) => g.options)))
  const n = (m: Mode) => all.filter((k) => MODE_RANK[props.schema.options[k]!.mode] <= MODE_RANK[m]).length
  return { simple: n('simple'), advanced: n('advanced'), expert: n('expert') }
})

// ---- search: every option on every tab, whatever the mode ------------------------
const hits = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (q.length < 2) return null
  const out: { path: string; key: string }[] = []
  for (const t of props.schema.tabs)
    for (const p of t.pages)
      if (shownPage(p.label))
        for (const g of p.groups)
          if (shownGroup(g.label))
            for (const k of g.options) {
              const d = props.schema.options[k]!
              const hay = `${k} ${d.label ?? ''} ${d.full_label ?? ''} ${d.tooltip ?? ''}`.toLowerCase()
              if (hay.includes(q)) out.push({ path: `${t.label} › ${p.label} › ${g.label}`, key: k })
            }
  return out.slice(0, 60)
})
const MODES: { value: Mode; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
]
</script>

<template>
  <div class="prusa">
    <div class="bar">
      <fieldset class="seg" aria-label="How many options to show">
        <label v-for="m in MODES" :key="m.value">
          <input v-model="mode" type="radio" name="prusa-mode" :value="m.value" class="visually-hidden" />
          <span :title="`${counts[m.value]} options`">{{ m.label }}</span>
        </label>
      </fieldset>
      <input v-model="query" type="search" class="search" placeholder="Search all options" aria-label="Search PrusaSlicer options" />
    </div>
    <p class="note">
      PrusaSlicer {{ schema.version }}: {{ counts[mode] }} options in {{ mode }} mode.
      <template v-if="changed.length">
        {{ changed.length }} changed from the Rhino profile ·
        <button type="button" class="link" @click="emit('resetAll')">Reset all</button>
      </template>
    </p>
    <p v-if="stale.length" class="note warn">Not used any more (unknown to this PrusaSlicer, or now set by the Rhino): {{ stale.join(', ') }}.</p>

    <!-- search results -->
    <template v-if="hits">
      <p v-if="!hits.length" class="note">Nothing matches “{{ query }}”.</p>
      <div v-for="h in hits" :key="h.key" class="hit">
        <span class="path">{{ h.path }}</span>
        <PrusaOption :k="h.key" :schema="schema" :ctx="ctx" show-key @set="(k, v) => emit('set', k, v)" />
      </div>
    </template>

    <template v-else>
      <div class="tabs" role="tablist" aria-label="PrusaSlicer settings">
        <button v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="t.id === tab.id" :class="{ on: t.id === tab.id }" @click="tabId = t.id">
          {{ t.label.replace(' Settings', '') }}
        </button>
      </div>
      <div class="pages" role="tablist" :aria-label="`${tab.label} pages`">
        <button
          v-for="p in tab.pages"
          :key="p.label"
          type="button"
          role="tab"
          :aria-selected="p.label === page?.label"
          :class="{ on: p.label === page?.label }"
          @click="pageByTab = { ...pageByTab, [tab.id]: p.label }"
        >
          {{ p.label }}<span v-if="pageChanged(p)" class="dot" :title="`${pageChanged(p)} changed`">{{ pageChanged(p) }}</span>
        </button>
      </div>

      <section v-for="g in page?.groups ?? []" :key="g.label" class="group">
        <h4>{{ g.label }}</h4>
        <div class="opts">
          <PrusaOption v-for="k in g.options" :key="k" :k="k" :schema="schema" :ctx="ctx" @set="(key, v) => emit('set', key, v)" />
        </div>
      </section>
      <p v-if="!tab.pages.length" class="note">Nothing on this tab in {{ mode }} mode.</p>
    </template>
  </div>
</template>

<style scoped>
.prusa { display: flex; flex-direction: column; gap: var(--rs-space-2); }
.bar { display: flex; align-items: center; gap: var(--rs-space-2); flex-wrap: wrap; }
.seg { display: inline-flex; margin: 0; padding: 0; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; }
.seg label + label span { border-left: 1px solid var(--rs-line-strong); }
.seg span { display: inline-flex; align-items: center; height: 32px; padding: 0 12px; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); cursor: pointer; }
.seg input:checked + span { background: var(--rs-ink); color: var(--rs-on-ink); }
.seg input:focus-visible + span { box-shadow: var(--rs-focus); }
.search { flex: 1; min-width: 140px; height: 34px; padding: 0 10px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
.note { margin: 0; font-size: 11px; color: var(--rs-text-muted); }
.note.warn { color: var(--rs-text-strong); }
.link { padding: 0; border: 0; background: none; color: var(--rs-text-strong); font: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.tabs { display: flex; border-bottom: 1px solid var(--rs-line); margin-top: var(--rs-space-2); }
.tabs button { flex: 1; height: 34px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--rs-text-muted); font: inherit; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); cursor: pointer; }
.tabs button.on { color: var(--rs-text-strong); border-bottom-color: var(--rs-ink); }
.pages { display: flex; flex-wrap: wrap; gap: 4px; padding: var(--rs-space-2) 0; }
.pages button {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: var(--rs-radius-sm);
  border: 1px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font: inherit; font-size: 12px; cursor: pointer;
}
.pages button.on { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.dot { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--rs-surface-2); color: var(--rs-text-strong); font-size: 10px; line-height: 16px; text-align: center; }
.on .dot { background: var(--rs-on-ink); color: var(--rs-ink); }
.group { border-top: 1px dotted var(--rs-line-strong); padding-top: var(--rs-space-2); }
.group h4 { margin: 0 0 2px; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); text-transform: none; }
.opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0 var(--rs-space-4); }
.hit { border-top: 1px solid var(--rs-line); padding-top: 4px; }
.path { font-size: 10px; color: var(--rs-text-muted); }
</style>
