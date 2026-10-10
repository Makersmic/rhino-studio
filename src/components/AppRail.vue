<script setup lang="ts">
import Icon from '@/icons/Icon.vue'
import type { NavIconId } from '@/icons/nav'

interface NavItem { to: string; label: string; icon: NavIconId }

const main: NavItem[] = [
  { to: '/prepare', label: 'Prepare', icon: 'prepare' },
  { to: '/preview', label: 'Preview', icon: 'preview' },
  { to: '/device', label: 'Device', icon: 'device' },
  { to: '/toolheads', label: 'Toolheads', icon: 'toolheads' },
  { to: '/files', label: 'Files', icon: 'files' },
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
          <span class="well"><Icon :nav="item.icon" :size="24" /></span>
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
  padding: var(--rs-space-5) var(--rs-space-2) var(--rs-space-4);
  background: var(--rs-bg);
  position: sticky;
  top: var(--rs-topbar-h);
  height: calc(100vh - var(--rs-topbar-h));
}
.group { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--rs-space-2); }
.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--rs-text-muted);
  text-decoration: none;
  font-size: var(--rs-text-xs);
  font-weight: var(--rs-weight-medium);
  border-radius: var(--rs-radius-md);
  padding: 2px 0 4px;
}
.well {
  display: grid;
  place-items: center;
  width: 52px;
  height: 36px;
  border-radius: var(--rs-radius-pill);
  transition: background var(--rs-dur) var(--rs-ease);
}
.item:hover { color: var(--rs-text-strong); }
.item:hover .well { background: var(--rs-surface); }
.item.router-link-active { color: var(--rs-text-strong); }
.item.router-link-active .well { background: var(--rs-active); color: var(--th-ink); }

/* Phones: rail becomes a bottom bar */
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
  .item { min-width: 68px; }
}
</style>
