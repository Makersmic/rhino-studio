<script setup lang="ts">
/** Settings / About. */
import './settings.css'
import RsPanel from '@/components/RsPanel.vue'
import { brand } from '@/brand/brand'
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="About" index="01" panel-id="settings.about">
        <p>{{ brand.name }} {{ brand.version }}</p>
        <p class="muted small">For the {{ brand.machine }}. Free software under GPL-3.0-or-later.</p>
        <p class="small"><RouterLink to="/settings/software">Software and updates</RouterLink> <span class="muted">· what Studio runs on, and the libraries it's built with</span></p>
        <p class="small"><RouterLink to="/style">Style guide</RouterLink> <span class="muted">· colours, type, icons and components</span></p>
      </RsPanel>
    </div>
  </div>
</template>
