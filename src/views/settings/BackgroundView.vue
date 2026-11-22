<script setup lang="ts">
/** Settings / Appearance / Background: the picture behind the page. It belongs to the theme in use. */
import './settings.css'
import RsPanel from '@/components/RsPanel.vue'
import PageImagePicker from './PageImagePicker.vue'
</script>

<template>
  <div class="set-page">
    <p class="scope muted small">The picture is kept on the Rhino and is part of the theme in use, so every screen shows it.</p>
    <div class="grid">
      <RsPanel title="Background picture" index="01" panel-id="settings.background">
        <PageImagePicker />
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.scope { margin: 0 0 var(--rs-space-3); }
</style>
