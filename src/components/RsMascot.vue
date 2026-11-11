<script setup lang="ts">
/**
 * The wizard mascot in the theme's ink (src/brand/mascot.ts). The PNG is a mask, so it is ink on paper in every look,
 * light, dark or a saved theme, and the paper shows through the rhino's body. Decorative: hidden from screen readers.
 */
import { computed } from 'vue'
import { poseUrl, type Pose } from '@/brand/mascot'

const props = defineProps<{ pose: Pose }>()
const style = computed(() => ({ '--pose': `url("${poseUrl(props.pose)}")` }))
</script>

<template>
  <span class="rs-mascot" :data-pose="pose" :style="style" aria-hidden="true" />
</template>

<style scoped>
.rs-mascot {
  display: block;
  width: 100%;
  aspect-ratio: 5 / 6;
  background: var(--rs-ink);
  -webkit-mask: var(--pose) center bottom / contain no-repeat;
  mask: var(--pose) center bottom / contain no-repeat;
}
</style>
