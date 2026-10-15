<script setup lang="ts">
/**
 * One toolhead's page, laid out like its pages in the user manual: the facts,
 * the tool connector and what each contact does, materials and macros, its
 * use and care on the left; its picture on the right.
 *
 * Read from the Portal's sheet for the tool. Built-in tools are read-only
 * (variables.cfg); added tools have Edit tool.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/icons/Icon.vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import CareBar from '@/maintenance/CareBar.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import ToolConnector from '@/toolmgr/ToolConnector.vue'
import { careText, fmtMeter } from '@/maintenance/summary'
import { lookFor } from '@/toolheads/registry'
import type { ToolSheetData } from '@/toolmgr/types'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useToolMgrStore } from '@/stores/toolmgr'
import { usePanelThemeStore } from '@/stores/panelTheme'

const route = useRoute()
const router = useRouter()
const machine = useMachineStore()
const care = useMaintenanceStore()
const tm = useToolMgrStore()
const panelTheme = usePanelThemeStore()
onBeforeUnmount(tm.use())

const name = computed(() => String(route.params.name ?? ''))
const sheet = ref<ToolSheetData | null>(null)
const error = ref<string | null>(null)
const showAll = ref(false)
const picked = ref<number | null>(null)
const photo = ref(0)

async function load() {
  error.value = null
  try {
    const s = await tm.client().sheet(name.value)
    if (s.name !== sheet.value?.name) {
      showAll.value = false
      photo.value = 0
      picked.value = null
    }
    sheet.value = s
  } catch (e) {
    error.value = (e as Error).message
  }
}
watch(name, load, { immediate: true })
// a change made elsewhere (the Portal, a restart) shows up here too
watch(() => tm.state, (s, prev) => { if (prev && s && JSON.stringify(s.tools.find((t) => t.name === name.value)) !== JSON.stringify(prev.tools.find((t) => t.name === name.value))) void load() })

const d = computed(() => sheet.value)
const look = computed(() => lookFor(name.value, (d.value?.type ?? undefined) as never))
const mounted = computed(() => machine.mountedVerified && machine.mountedName === name.value)
const used = computed(() => (d.value?.contacts ?? []).filter((c) => c.used))
const rows = computed(() => (d.value?.contacts ?? []).filter((c) => showAll.value || c.used))
const toolCare = computed(() => care.forTool(name.value))
const meters = computed(() => care.overview?.meters.tools[name.value] ?? [])
const dark = computed(() => panelTheme.mode === 'night')
const pictures = computed(() => {
  const s = d.value
  if (!s) return []
  if (s.builtin) {
    const img = dark.value && s.image_dark ? s.image_dark : s.image
    return img ? [tm.client().media(img)!] : []
  }
  return (s.photos ?? []).map((p) => tm.client().media(p)!).filter(Boolean)
})
const lineArt = computed(() => !!d.value?.image_dark)

function pick(n: number) {
  picked.value = n
  if (!used.value.some((c) => c.contact === n)) showAll.value = true
  requestAnimationFrame(() => document.querySelector(`[data-contact="${n}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}
</script>

<template>
  <div class="view">
    <RouterLink to="/toolheads" class="back">‹ Toolheads</RouterLink>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="!d" class="muted">Loading {{ name }}…</p>

    <template v-else>
      <header class="head" :style="{ '--accent': `var(${look.accentVar})` }">
        <span class="emblem"><Icon :tool="look.icon" :size="44" /></span>
        <div class="title">
          <h1>{{ d.name }}</h1>
          <p class="tags">
            <span class="chip">Slot {{ d.slot }}</span>
            <span class="chip quiet">{{ d.builtin ? 'Built in' : 'Added tool' }}</span>
            <span v-if="mounted" class="chip ink">Mounted</span>
            <span class="kind">{{ d.category_label ? `${d.category_label} · ` : '' }}{{ d.kind }}</span>
          </p>
        </div>
        <div class="actions">
          <RsButton @click="router.push({ path: '/care', query: { tool: d.name } })">Care tasks</RsButton>
          <RsButton v-if="!d.builtin" variant="primary" @click="router.push(`/toolheads/${encodeURIComponent(d.name)}/edit`)">Edit tool</RsButton>
        </div>
      </header>

      <RestartBanner />

      <div class="grid">
        <div class="left">
          <RsPanel title="About" panel-id="tool.about">
            <p v-if="d.about" class="about">{{ d.about }}</p>
            <dl class="facts">
              <dt>Function</dt><dd>{{ d.function || '—' }}</dd>
              <dt>Slot</dt><dd>{{ d.slot }}</dd>
              <dt>Set up a job with</dt><dd><code>{{ d.setup || '—' }}</code></dd>
              <dt>Outputs in Klipper</dt><dd>{{ d.outputs_text || '—' }}</dd>
              <template v-if="d.capabilities?.length"><dt>Brings</dt><dd>{{ d.capabilities.join(' · ') }}</dd></template>
              <template v-if="d.notes"><dt>Notes</dt><dd class="pre">{{ d.notes }}</dd></template>
            </dl>
          </RsPanel>

          <RsPanel title="Tool connector" panel-id="tool.connector">
            <p class="sub">{{ used.length }} of 21 contacts used. Select a contact to find it in the table.</p>
            <ToolConnector :contacts="d.contacts" :selected="picked" @pick="pick" />
            <table class="tbl pins">
              <thead><tr><th class="num">Pin</th><th>Use on this tool</th><th>Board pin</th></tr></thead>
              <tbody>
                <tr v-for="c in rows" :key="c.contact" :data-contact="c.contact" :class="{ unused: !c.used, hit: picked === c.contact }">
                  <td class="num">{{ c.contact }}</td>
                  <td>{{ c.used ? c.use || c.label : '—' }}</td>
                  <td class="mono">{{ c.pin }}</td>
                </tr>
                <tr v-if="!rows.length"><td colspan="3" class="none">No connector contacts recorded{{ d.builtin ? '' : ': select them with Edit tool' }}.</td></tr>
              </tbody>
            </table>
            <div v-if="d.other_pins?.length" class="other">
              <span class="lbl">Wired to the board outside the connector</span>
              <ul><li v-for="p in d.other_pins" :key="p.pin"><code>{{ p.pin }}</code> {{ p.use }}</li></ul>
            </div>
            <RsButton size="sm" variant="quiet" @click="showAll = !showAll">{{ showAll ? 'Show only the contacts it uses' : 'Show all 21 contacts' }}</RsButton>
          </RsPanel>

          <RsPanel :title="`Materials (${d.material_rows.length})`" panel-id="tool.materials">
            <table v-if="d.material_rows.length" class="tbl">
              <thead>
                <tr><th>Material</th><th v-for="c in d.material_columns" :key="c.field" class="num">{{ c.label }}<span v-if="c.unit" class="unit">{{ ` ${c.unit}` }}</span></th></tr>
              </thead>
              <tbody>
                <tr v-for="m in d.material_rows" :key="m.key"><td>{{ m.label }}</td><td v-for="(v, i) in m.values" :key="i" class="num">{{ v === '' ? '—' : v }}</td></tr>
              </tbody>
            </table>
            <p v-else class="muted">No materials yet.</p>
            <p class="sub">{{ d.builtin ? 'Built-in materials are set in variables.cfg.' : 'Change materials with Edit tool.' }}</p>
          </RsPanel>

          <RsPanel title="Macros for this tool" panel-id="tool.macros">
            <ul v-if="d.macro_list.length" class="macros">
              <li v-for="m in d.macro_list" :key="m.name"><code>{{ m.name }}</code><span v-if="m.description" class="muted">{{ m.description }}</span></li>
            </ul>
            <p v-else class="muted">No macros of its own.</p>
          </RsPanel>
        </div>

        <div class="right">
          <figure class="plate" :class="{ lineart: lineArt }">
            <img v-if="pictures.length" :src="pictures[Math.min(photo, pictures.length - 1)]" :alt="d.name" />
            <div v-else class="noimg">
              <Icon :tool="look.icon" :size="120" />
              <span>{{ d.builtin ? 'No picture' : 'No picture yet: add one with Edit tool' }}</span>
            </div>
            <figcaption v-if="d.image_notes?.length"><span v-for="(n, i) in d.image_notes" :key="i">* {{ n }}</span></figcaption>
          </figure>
          <div v-if="pictures.length > 1 && !d.builtin" class="thumbs">
            <button v-for="(p, i) in pictures" :key="p" type="button" :class="{ on: i === photo }" :aria-label="`Photo ${i + 1}`" @click="photo = i"><img :src="p" alt="" loading="lazy" /></button>
          </div>

          <RsPanel title="Use and care" panel-id="tool.care">
            <dl v-if="meters.length" class="facts">
              <template v-for="m in meters" :key="m.meter"><dt>{{ m.label }}</dt><dd>{{ fmtMeter(m.value, m.unit) }}</dd></template>
            </dl>
            <p v-else class="muted">No usage counted yet.</p>
            <template v-if="toolCare?.total">
              <p class="caretext">{{ careText(toolCare) }}<template v-if="toolCare.next"> · next: {{ toolCare.next.title }}</template></p>
              <CareBar :fraction="toolCare.worstFraction" :level="toolCare.level" :label="`${d.name}: closest care task`" />
              <p v-if="toolCare.next?.status?.next?.text" class="sub">{{ toolCare.next.status.next.text }}</p>
            </template>
            <p v-else class="sub">No care tasks for this tool yet.</p>
          </RsPanel>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.back { align-self: flex-start; font-size: var(--rs-text-sm); color: var(--rs-text-strong); text-decoration: none; }
.back:hover { text-decoration: underline; text-underline-offset: 3px; }
.err { color: var(--rs-danger); }
.muted { color: var(--rs-text-muted); }
.head { display: flex; align-items: center; gap: var(--rs-space-4); flex-wrap: wrap; }
.emblem { position: relative; display: grid; place-items: center; width: 72px; height: 72px; flex: none; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text-strong); overflow: hidden; }
.emblem::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--accent); }
.title { flex: 1; min-width: 200px; }
.title h1 { margin: 0; }
.tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 0; }
.chip { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); padding: 2px 9px; border-radius: var(--rs-radius-sm); border: 1px solid var(--rs-line-strong); color: var(--rs-text-strong); }
.chip.quiet { border-style: dashed; }
.chip.ink { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.kind { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.actions { display: flex; gap: var(--rs-space-2); }

.grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: var(--rs-gap); align-items: start; }
.left, .right { display: flex; flex-direction: column; gap: var(--rs-gap); min-width: 0; }
.about { margin: 0 0 var(--rs-space-3); }
.facts { display: grid; grid-template-columns: minmax(110px, auto) 1fr; gap: 6px var(--rs-space-4); margin: 0; font-size: var(--rs-text-sm); }
.facts dt { color: var(--rs-text-muted); }
.facts dd { margin: 0; color: var(--rs-text-strong); min-width: 0; overflow-wrap: anywhere; }
.pre { white-space: pre-line; }
code, .mono { font-family: var(--rs-font-code); font-size: 0.92em; }
.sub { margin: var(--rs-space-2) 0; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }

.tbl { width: 100%; border-collapse: collapse; margin: var(--rs-space-3) 0; font-size: var(--rs-text-sm); }
.tbl th { text-align: left; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding: 4px 8px 6px 0; border-bottom: 1px solid var(--rs-line-strong); }
.tbl td { padding: 5px 8px 5px 0; border-bottom: 1px dotted var(--rs-line); color: var(--rs-text-strong); }
.tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.tbl.pins .num { text-align: left; width: 44px; }
.unit { font-weight: 400; }
.none { color: var(--rs-text-muted); font-size: var(--rs-text-xs); }
.unused td { color: var(--rs-text-muted); }
tr.hit td { background: var(--rs-dither-faint); box-shadow: inset 0 -1px 0 var(--rs-ink); }
.other { margin: 0 0 var(--rs-space-3); font-size: var(--rs-text-sm); }
.lbl { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.other ul { margin: 4px 0 0; padding-left: 18px; }
.macros { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.macros li { display: flex; flex-direction: column; gap: 2px; font-size: var(--rs-text-sm); }
.macros code { color: var(--rs-text-strong); font-weight: 600; }

.plate { margin: 0; padding: var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); display: flex; flex-direction: column; align-items: center; gap: var(--rs-space-3); }
.plate.lineart { background: var(--rs-dither-faint), var(--rs-surface); }
.plate img { max-width: 100%; max-height: 520px; object-fit: contain; }
.noimg { display: flex; flex-direction: column; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-6) 0; color: var(--rs-text-muted); font-size: var(--rs-text-sm); text-align: center; }
figcaption { display: flex; flex-direction: column; gap: 2px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); align-self: stretch; }
.thumbs { display: flex; flex-wrap: wrap; gap: 6px; }
.thumbs button { width: 64px; height: 64px; padding: 0; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-sm); background: none; cursor: pointer; overflow: hidden; }
.thumbs button.on { border: 2px solid var(--rs-ink); }
.thumbs img { width: 100%; height: 100%; object-fit: cover; }
.caretext { margin: var(--rs-space-3) 0 6px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }

@media (max-width: 960px) { .grid { grid-template-columns: minmax(0, 1fr); } .right { order: -1; } .plate img { max-height: 300px; } }
</style>
