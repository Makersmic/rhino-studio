<script setup lang="ts">
/** Wizards overview: every wizard as a card, grouped, with what it is for and when to run it. */
import RsPanel from '@/components/RsPanel.vue'
import StatusChip from '@/components/StatusChip.vue'
import { COMING, GROUPS, WIZARDS } from '@/wizards/wizards'
</script>

<template>
  <div class="home">
    <RsPanel v-for="g in GROUPS" :key="g.id" :title="g.label" :panel-id="`wizards.${g.id}`">
      <p class="blurb">{{ g.blurb }}</p>
      <ul class="cards">
        <li v-for="w in WIZARDS.filter((x) => x.group === g.id)" :key="w.id">
          <RouterLink :to="w.path" class="card">
            <b>{{ w.title }}</b>
            <span>{{ w.what }}</span>
            <span class="when">{{ w.when }}</span>
            <StatusChip v-if="w.acts" tone="neutral">Moves or heats</StatusChip>
          </RouterLink>
        </li>
      </ul>
    </RsPanel>
    <RsPanel v-if="COMING.length" title="Coming next" panel-id="wizards.coming">
      <ul class="coming"><li v-for="c in COMING" :key="c">{{ c }}</li></ul>
    </RsPanel>
  </div>
</template>

<style scoped>
.home { display: flex; flex-direction: column; gap: var(--rs-space-4); }
.blurb { margin: 0 0 var(--rs-space-3); color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--rs-space-3); }
.card { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; height: 100%; padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); text-decoration: none; font-size: var(--rs-text-sm); }
.card:hover { border-color: var(--rs-ink); }
.card b { font-size: var(--rs-text-base, 15px); font-weight: var(--rs-weight-medium); }
.card .when { color: var(--rs-text-muted); }
.coming { margin: 0; padding-left: 1.2em; color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
</style>
