<script setup lang="ts">
/** Settings / Appearance / Text: colour, typefaces, and the fonts you add. All part of the theme in use. */
import './settings.css'
import RsPanel from '@/components/RsPanel.vue'
import TextColourPicker from './TextColourPicker.vue'
import TypefacePicker from './TypefacePicker.vue'
import FontUploader from './FontUploader.vue'
</script>

<template>
  <div class="set-page">
    <p class="scope muted small">Text settings are part of the theme in use and are kept on the Rhino, so every screen shows them.</p>
    <div class="grid">
      <RsPanel title="Text colour" index="01" panel-id="settings.text">
        <TextColourPicker />
      </RsPanel>
      <RsPanel title="Typefaces" index="02" panel-id="settings.text.faces">
        <TypefacePicker />
      </RsPanel>
      <RsPanel title="Your fonts" index="03" panel-id="settings.text.fonts">
        <FontUploader />
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.scope { margin: 0 0 var(--rs-space-3); }
</style>
