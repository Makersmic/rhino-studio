<script setup lang="ts">
/** Settings / Cameras: Moonraker's camera list, shared with every screen. */
import './settings.css'
import CamerasPanel from '@/webcams/CamerasPanel.vue'
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <CamerasPanel class="wide" />
    </div>
  </div>
</template>
