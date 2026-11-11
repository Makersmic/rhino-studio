<script setup lang="ts">
/**
 * Settings / Help: the Rhino manual, from the Rhino itself (help/, made by the Tool Manager's manual/web.py and
 * copied in by its release). Contents, one chapter at a time, search, and the printable PDF. Reads and links only.
 * Logic in src/help/help.ts.
 */
import './settings.css'
import '@/toolmgr/forms.css'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import { HELP_BASE, chapterHtml, helpRoute, neighbours, parseIndex, searchHelp, type HelpIndex } from '@/help/help'

const route = useRoute()
const ix = ref<HelpIndex | null>(null)
const failed = ref('')
const q = ref('')
const html = ref('')
const pageError = ref('')
const doc = ref<HTMLElement | null>(null)

const chapterKey = computed(() => (route.params.chapter as string | undefined) ?? '')
const sectionId = computed(() => (route.params.section as string | undefined) ?? '')
const chapter = computed(() => (ix.value && chapterKey.value ? ix.value.chapters[chapterKey.value] ?? null : null))
const hits = computed(() => (ix.value && q.value.trim() ? searchHelp(ix.value, q.value) : []))
const near = computed(() => (ix.value && chapterKey.value ? neighbours(ix.value, chapterKey.value) : {}))
const titleOf = (k?: string) => (k && ix.value?.chapters[k]?.title) || ''
const go = (chapter: string, section?: string) => helpRoute({ chapter, section: section || undefined })

onMounted(async () => {
  try {
    const r = await fetch(`${HELP_BASE}index.json`, { cache: 'no-cache' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    ix.value = parseIndex(await r.json())
  } catch {
    failed.value = 'Help isn’t in this copy of Studio. It comes with Tool Manager releases from 1.9.24; the PDF manual below has the same pages.'
  }
})

async function loadChapter() {
  html.value = ''
  pageError.value = ''
  if (!chapter.value) return
  try {
    const r = await fetch(`${HELP_BASE}${encodeURIComponent(chapterKey.value)}.html`, { cache: 'no-cache' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    html.value = chapterHtml(await r.text())
  } catch (e) {
    pageError.value = `This page didn’t load (${(e as Error).message}).`
  }
  await nextTick()
  scrollToSection()
}

function scrollToSection() {
  const el = sectionId.value ? doc.value?.querySelector(`[id="${CSS.escape(sectionId.value)}"]`) : null
  if (el) el.scrollIntoView({ block: 'start' })
  else window.scrollTo({ top: 0 })
}

watch([chapter, chapterKey], () => { q.value = ''; void loadChapter() })
watch(sectionId, () => void nextTick(scrollToSection))
</script>

<template>
  <div class="set-page help">
    <div class="bar">
      <input v-model="q" class="tm-in search" type="search" placeholder="Search the manual" aria-label="Search the manual" :disabled="!ix" />
      <a class="pdf" :href="ix?.pdf ?? 'https://github.com/Makersmic/Toolhead_Manager/blob/main/manual/Rhino-User-Manual.pdf'" target="_blank" rel="noopener">Printable PDF ↗</a>
    </div>

    <p v-if="failed" class="msg">{{ failed }}</p>

    <!-- search results -->
    <RsPanel v-else-if="q.trim()" :title="hits.length ? `${hits.length === 20 ? 'Top 20' : hits.length} found` : 'Nothing found'" panel-id="help.search">
      <p v-if="!hits.length" class="muted small">No page has every one of those words. Try fewer or different words.</p>
      <ol class="hits">
        <li v-for="h in hits" :key="`${h.chapter}/${h.section}`">
          <RouterLink :to="go(h.chapter, h.section)" @click="q = ''"><strong>{{ h.title }}</strong> <span class="muted">· {{ h.where }}</span></RouterLink>
          <small>{{ h.snippet }}</small>
        </li>
      </ol>
    </RsPanel>

    <!-- one chapter -->
    <template v-else-if="chapter">
      <nav class="crumbs small">
        <RouterLink to="/settings/help">Contents</RouterLink>
        <span class="muted"> › {{ chapter.part }}</span>
      </nav>
      <RsPanel :title="chapter.title" panel-id="help.page">
        <ul v-if="chapter.sections.filter((s) => s.id).length > 1" class="toc">
          <li v-for="s in chapter.sections.filter((s) => s.id)" :key="s.id">
            <RouterLink :to="go(chapterKey, s.id)" :class="{ on: s.id === sectionId }">{{ s.title }}</RouterLink>
          </li>
        </ul>
        <p v-if="pageError" class="msg">{{ pageError }}</p>
        <!-- eslint-disable-next-line vue/no-v-html -- built from the manual, cleaned twice: manual/web.py and chapterHtml -->
        <div ref="doc" class="doc" v-html="html" />
      </RsPanel>
      <nav class="pager">
        <RouterLink v-if="near.prev" :to="go(near.prev)" class="prev"><small>Previous</small>{{ titleOf(near.prev) }}</RouterLink>
        <span v-else />
        <RouterLink v-if="near.next" :to="go(near.next)" class="next"><small>Next</small>{{ titleOf(near.next) }}</RouterLink>
      </nav>
    </template>

    <!-- contents -->
    <template v-else-if="ix">
      <p v-if="chapterKey" class="msg">There’s no page called “{{ chapterKey }}” in this manual. Here are the contents.</p>
      <div class="grid">
        <RsPanel v-for="(p, i) in ix.parts" :key="p.title" :title="p.title" :index="String(i + 1).padStart(2, '0')" :panel-id="`help.part${i + 1}`">
          <ul class="chapters">
            <li v-for="k in p.chapters" :key="k"><RouterLink :to="go(k)">{{ ix.chapters[k]!.title }}</RouterLink></li>
          </ul>
        </RsPanel>
      </div>
      <p class="muted small foot">The manual for Tool Manager {{ ix.version }}, served by the Rhino: no internet needed.</p>
    </template>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: var(--rs-space-3); flex-wrap: wrap; margin-bottom: var(--rs-gap); }
.search { flex: 1; min-width: 200px; max-width: 520px; }
.pdf { font-size: var(--rs-text-sm); color: var(--rs-text-strong); white-space: nowrap; }
.muted { color: var(--rs-text-muted); font-weight: 400; }
.foot { margin-top: var(--rs-gap); }
.chapters, .hits, .toc { list-style: none; margin: 0; padding: 0; }
.chapters li + li { border-top: 1px solid var(--rs-line); }
.chapters a { display: block; padding: 9px 0; color: var(--rs-text-strong); text-decoration: none; font-size: var(--rs-text-sm); }
.chapters a:hover { text-decoration: underline; text-underline-offset: 3px; }
.hits li { padding: 10px 0; border-top: 1px solid var(--rs-line); display: flex; flex-direction: column; gap: 2px; }
.hits li:first-child { border-top: 0; }
.hits a { color: var(--rs-text-strong); text-decoration: none; font-size: var(--rs-text-sm); }
.hits a:hover strong { text-decoration: underline; text-underline-offset: 3px; }
.hits small { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.crumbs { margin: 0 0 var(--rs-space-2); }
.crumbs a { color: var(--rs-text-strong); }
.toc { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--rs-space-4); padding-bottom: var(--rs-space-3); border-bottom: 1px dotted var(--rs-line-strong); }
.toc a { display: inline-block; font-size: var(--rs-text-xs); padding: 0 10px; line-height: 26px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong); color: var(--rs-text); text-decoration: none; }
.toc a:hover { color: var(--rs-text-strong); box-shadow: inset 0 0 0 1px var(--rs-text-strong); }
.toc a.on { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
.pager { display: flex; justify-content: space-between; gap: var(--rs-space-3); margin-top: var(--rs-gap); }
.pager a { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); color: var(--rs-text-strong); text-decoration: none; font-size: var(--rs-text-sm); max-width: 48%; }
.pager a:hover { background: var(--rs-surface-2); }
.pager small { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.pager .next { text-align: right; margin-left: auto; }

/* The manual's own HTML: plain reading styles, from the tokens */
.doc { font-size: var(--rs-text-sm); line-height: 1.6; color: var(--rs-text); max-width: 78ch; overflow-wrap: anywhere; }
.doc :deep(h3) { font-size: var(--rs-text-lg, 1.15rem); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); margin: 1.6em 0 0.5em; scroll-margin-top: calc(var(--rs-topbar-h) + 12px); }
.doc :deep(h4) { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); margin: 1.2em 0 0.4em; scroll-margin-top: calc(var(--rs-topbar-h) + 12px); }
.doc :deep(> section > :first-child), .doc :deep(> :first-child) { margin-top: 0; }
.doc :deep(p) { margin: 0 0 0.8em; }
.doc :deep(ul), .doc :deep(ol) { margin: 0 0 0.9em; padding-left: 1.3em; }
.doc :deep(li) { margin: 0.25em 0; }
.doc :deep(b), .doc :deep(strong) { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.doc :deep(code) { font-family: var(--rs-font-code); font-size: 0.92em; padding: 0 4px; border-radius: var(--rs-radius-sm); background: var(--rs-surface-2); }
.doc :deep(pre) { font-family: var(--rs-font-code); font-size: 12px; padding: 10px 12px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); overflow-x: auto; }
.doc :deep(a) { color: var(--rs-text-strong); text-underline-offset: 3px; }
.doc :deep(figure) { margin: 1em 0 1.2em; }
.doc :deep(img) { display: block; max-width: 100%; height: auto; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line); }
.doc :deep(figcaption) { font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin-top: 6px; }
.doc :deep(svg) { max-width: 100%; height: auto; }
.doc :deep(table) { width: 100%; border-collapse: collapse; margin: 0 0 1em; font-size: var(--rs-text-xs); display: block; overflow-x: auto; }
.doc :deep(th) { text-align: left; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding: 6px 8px; border-bottom: 1px solid var(--rs-line-strong); }
.doc :deep(td) { padding: 6px 8px; border-bottom: 1px solid var(--rs-line); vertical-align: top; }
</style>
