<script setup lang="ts">
import Icon from '@/icons/Icon.vue'
import type { NavIconId } from '@/icons/nav'
import { useMaintenanceStore } from '@/stores/maintenance'

const care = useMaintenanceStore()

interface NavItem { to: string; label: string; icon: NavIconId }

const main: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/prepare', label: 'Prepare', icon: 'prepare' },
  { to: '/preview', label: 'Preview', icon: 'preview' },
  { to: '/control', label: 'Control', icon: 'control' },
  { to: '/toolheads', label: 'Toolheads', icon: 'toolheads' },
  { to: '/files', label: 'Files', icon: 'files' },
  { to: '/care', label: 'Care', icon: 'care' },
]
const secondary: NavItem[] = [
  { to: '/style', label: 'Style', icon: 'style' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]
</script>

<template>
  <nav class="rail" aria-label="Main">
    <ul class="group">
      <li v-for="item in main" :key="item.to">
        <RouterLink :to="item.to" class="item">
          <span class="well">
            <Icon :nav="item.icon" :size="24" />
            <span
              v-if="item.icon === 'care' && care.counts.overdue + care.counts.due_soon > 0"
              class="count"
              :class="{ overdue: care.counts.overdue > 0 }"
              :aria-label="`${care.counts.overdue + care.counts.due_soon} maintenance tasks due`"
            >{{ care.counts.overdue + care.counts.due_soon }}</span>
          </span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>
    <ul class="group bottom">
      <li v-for="item in secondary" :key="item.to">
        <RouterLink :to="item.to" class="item">
          <span class="well"><Icon :nav="item.icon" :size="24" /></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.rail {
  width: var(--rs-rail-w);
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--rs-space-4) var(--rs-space-2) var(--rs-space-4);
  background: var(--rs-bg);
  position: sticky;
  top: var(--rs-topbar-h);
  height: calc(100vh - var(--rs-topbar-h));
}
.group { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--rs-text-muted);
  text-decoration: none;
  font-size: 11px;
  font-weight: var(--rs-weight-medium);
  border-radius: var(--rs-radius-md);
  padding: 6px 0;
}
.well {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 34px;
  border-radius: var(--rs-radius-md);
  transition: background var(--rs-dur) var(--rs-ease);
}
.count {
  position: absolute;
  top: -5px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--rs-radius-sm);
  background: var(--rs-surface);
  color: var(--rs-text-strong);
  box-shadow: inset 0 0 0 1px var(--rs-line-strong);
  font-size: 11px;
  font-weight: var(--rs-weight-bold);
  line-height: 18px;
  text-align: center;
}
.count.overdue { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
.item:hover { color: var(--rs-text-strong); }
.item:hover .well { background: var(--rs-surface); }
.item.router-link-active { color: var(--rs-text-strong); }
.item.router-link-active .well { background: var(--rs-ink); color: var(--rs-on-ink); }

@media (max-width: 720px) {
  .rail {
    position: fixed;
    inset: auto 0 0 0;
    width: 100%;
    height: auto;
    flex-direction: row;
    padding: var(--rs-space-2) var(--rs-space-1);
    border-top: 1px solid var(--rs-line);
    z-index: 20;
    overflow-x: auto;
  }
  .group { flex-direction: row; gap: 0; }
  .group:first-child { flex: 1; justify-content: space-between; }
  .item { min-width: 44px; font-size: 10px; letter-spacing: -0.01em; }
  .bottom li:first-child { display: none; }
}
</style>
