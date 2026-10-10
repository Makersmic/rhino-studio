<script setup lang="ts">
/** The job pipeline, in order. Each step says which build phase delivers it. */
const steps = [
  { title: 'Import', detail: 'STL, SVG or DXF', phase: 'Phase 3' },
  { title: 'Toolhead', detail: 'Pick the tool and profile', phase: 'Phase 3' },
  { title: 'Prepare', detail: 'Slice or generate toolpaths', phase: 'Phase 3–4' },
  { title: 'Preview', detail: 'Check every move', phase: 'Phase 6' },
  { title: 'Send', detail: 'Upload, tool check, confirm', phase: 'Phase 2–3' },
  { title: 'Monitor', detail: 'Live status and control', phase: 'Phase 6' },
]
</script>

<template>
  <ol class="steps">
    <li v-for="(s, i) in steps" :key="s.title" class="step">
      <span class="num">{{ String(i + 1).padStart(2, '0') }}</span>
      <span class="title">{{ s.title }}</span>
      <span class="detail">{{ s.detail }}</span>
      <span class="phase">{{ s.phase }}</span>
    </li>
  </ol>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--rs-gap);
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.step {
  display: flex;
  flex-direction: column;
  padding: var(--rs-space-4);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  min-height: 150px;
}
.num {
  font-size: var(--rs-text-xl);
  font-weight: var(--rs-weight-light);
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--rs-text-muted);
  margin-bottom: auto;
}
.title { margin-top: var(--rs-space-4); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.detail { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.phase { font-family: var(--rs-font-code); font-size: 11px; color: var(--rs-text-muted); margin-top: var(--rs-space-2); }
@media (max-width: 1100px) { .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 560px) { .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } .step { min-height: 130px; } }
</style>
