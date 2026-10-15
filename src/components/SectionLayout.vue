<script setup lang="ts">
/**
 * A screen with its own section menu: Care and Toolheads.
 *
 * Desktop: a menu down the left (groups fold, and the whole menu folds to a
 * slim strip; both are remembered in this browser). Phone and narrow windows:
 * one button at the top that names the section you're in and opens the menu.
 *
 * Each item can carry a count (inked when it needs you, like the rail's
 * Care count) so the menu doubles as a summary.
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

export interface SectionItem {
  to: string
  label: string
  /** a count shown at the right; 0 or '' hides it */
  count?: number | string
  /** ink the count (overdue tasks, a restart waiting) */
  strong?: boolean
  /** other paths that light this item (a tool's page lights Library) */
  match?: RegExp
}
export interface SectionGroup {
  id: string
  /** groups without a label never fold */
  label?: string
  items: SectionItem[]
}

const props = defineProps<{ title: string; groups: SectionGroup[]; storageKey: string }>()
const route = useRoute()

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
    /* private window: folds just aren't remembered */
  }
}

const folded = ref<Record<string, boolean>>(load(`rs.nav.${props.storageKey}.groups`, {}))
const slim = ref<boolean>(load(`rs.nav.${props.storageKey}.slim`, false))
const open = ref(false) // phone menu
watch(folded, (v) => save(`rs.nav.${props.storageKey}.groups`, v), { deep: true })
watch(slim, (v) => save(`rs.nav.${props.storageKey}.slim`, v))

const isActive = (it: SectionItem) => route.path === it.to || (it.match?.test(route.path) ?? false)
const current = computed(() => props.groups.flatMap((g) => g.items).find(isActive) ?? null)
// The group you're in never stays folded
watch(
  () => route.path,
  () => {
    open.value = false
    const g = props.groups.find((x) => x.items.some(isActive))
    if (g && folded.value[g.id]) folded.value = { ...folded.value, [g.id]: false }
  },
  { immediate: true },
)
const toggle = (id: string) => (folded.value = { ...folded.value, [id]: !folded.value[id] })
const groupCount = (g: SectionGroup) => g.items.reduce((n, i) => n + (typeof i.count === 'number' && i.strong ? i.count : 0), 0)
</script>

<template>
  <div class="sl" :class="{ slim }">
    <!-- phone: one button names where you are -->
    <div class="phone">
      <button type="button" class="pick" :aria-expanded="open" aria-controls="sl-menu" @click="open = !open">
        <span class="t">{{ title }}</span>
        <span class="sep" aria-hidden="true">/</span>
        <span class="c">{{ current?.label ?? 'Sections' }}</span>
        <span class="chev" :class="{ up: open }" aria-hidden="true" />
      </button>
    </div>

    <nav id="sl-menu" class="menu" :class="{ open }" :aria-label="`${title} sections`">
      <div class="mhead">
        <span class="mtitle">{{ title }}</span>
        <button type="button" class="fold" :aria-label="slim ? `Show the ${title} menu` : `Hide the ${title} menu`" :title="slim ? 'Show menu' : 'Hide menu'" @click="slim = !slim">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path :d="slim ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
      </div>
      <div class="groups">
        <section v-for="g in groups" :key="g.id" class="grp">
          <button v-if="g.label" type="button" class="ghead" :aria-expanded="!folded[g.id]" @click="toggle(g.id)">
            <span class="chev sm" :class="{ up: !folded[g.id] }" aria-hidden="true" />
            <span class="gl">{{ g.label }}</span>
            <span v-if="folded[g.id] && groupCount(g)" class="count strong">{{ groupCount(g) }}</span>
          </button>
          <ul v-show="!g.label || !folded[g.id]">
            <li v-for="it in g.items" :key="it.to">
              <RouterLink :to="it.to" class="item" :class="{ on: isActive(it) }" :aria-current="isActive(it) ? 'page' : undefined">
                <span class="il">{{ it.label }}</span>
                <span v-if="it.count" class="count" :class="{ strong: it.strong }">{{ it.count }}</span>
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>
    </nav>

    <div class="content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.sl { display: grid; grid-template-columns: 216px minmax(0, 1fr); align-items: start; flex: 1; }
.sl.slim { grid-template-columns: 44px minmax(0, 1fr); }
.content { min-width: 0; }

.menu {
  position: sticky; top: var(--rs-topbar-h); max-height: calc(100vh - var(--rs-topbar-h)); overflow: auto;
  padding: var(--rs-space-5) var(--rs-space-2) var(--rs-space-5) var(--rs-space-4);
  display: flex; flex-direction: column; gap: var(--rs-space-3);
}
.mhead { display: flex; align-items: center; justify-content: space-between; gap: var(--rs-space-2); padding-left: 10px; min-height: 30px; }
.mtitle { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); letter-spacing: -0.01em; }
.fold {
  width: 30px; height: 30px; flex: none; display: grid; place-items: center; border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line); background: transparent; color: var(--rs-text-muted); cursor: pointer;
}
.fold:hover { color: var(--rs-text-strong); border-color: var(--rs-line-strong); }
.slim .menu { padding: var(--rs-space-5) 0 0 var(--rs-space-2); }
.slim .mhead { padding: 0; }
.slim .mtitle, .slim .groups { display: none; }

.groups { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.grp ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.ghead {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px 4px; border: 0; background: none; cursor: pointer;
  font: inherit; font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); text-align: left;
}
.ghead:hover { color: var(--rs-text-strong); }
.gl { flex: 1; }
.item {
  display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 10px; border-radius: var(--rs-radius-md);
  color: var(--rs-text); text-decoration: none; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium);
}
.grp:has(.ghead) .item { padding-left: 26px; }
.item:hover { background: var(--rs-surface); color: var(--rs-text-strong); }
.item.on { background: var(--rs-ink); color: var(--rs-on-ink); }
.il { flex: 1; min-width: 0; padding: 7px 0; line-height: 1.3; }
.count {
  min-width: 20px; height: 20px; padding: 0 6px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong);
  font-size: 11px; font-weight: var(--rs-weight-bold); line-height: 20px; text-align: center; color: var(--rs-text-strong); background: var(--rs-surface);
}
.count.strong { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
.item.on .count { background: var(--rs-on-ink); color: var(--rs-ink); box-shadow: none; }

/* a CSS chevron: right when folded, down when open */
.chev { width: 8px; height: 8px; border-right: 1.6px solid currentColor; border-bottom: 1.6px solid currentColor; transform: rotate(-45deg); transition: transform var(--rs-dur) var(--rs-ease); flex: none; }
.chev.up { transform: rotate(45deg); }
.chev.sm { width: 6px; height: 6px; }

.phone { display: none; }

@media (max-width: 900px) {
  .sl, .sl.slim { grid-template-columns: minmax(0, 1fr); }
  .phone { display: block; padding: var(--rs-space-3) var(--rs-space-3) 0; }
  .pick {
    display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 0 var(--rs-space-4);
    border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong);
    font: inherit; font-size: var(--rs-text-md); cursor: pointer; text-align: left;
  }
  .pick .t { color: var(--rs-text-muted); }
  .pick .sep { color: var(--rs-line-strong); }
  .pick .c { flex: 1; font-weight: var(--rs-weight-medium); }
  .pick .chev { transform: rotate(45deg); margin-top: -4px; }
  .pick .chev.up { transform: rotate(-135deg); margin-top: 4px; }
  .menu, .slim .menu {
    display: none; position: static; max-height: none; margin: var(--rs-space-2) var(--rs-space-3) 0; padding: var(--rs-space-3);
    border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-bg);
  }
  .menu.open { display: flex; }
  .mhead { display: none; }
  .slim .groups { display: flex; }
}
</style>
