<script setup lang="ts">
/**
 * Generated text (G-code or config) a wizard is going to write, shown so it can be read and, with Edit, changed
 * (docs/wizard-rules.md, rule 2). Reset puts back what the wizard wrote. `problem` is the reason the Portal or Studio
 * refused the current text, shown under the box; the text isn't kept until it is gone. An edited block is labelled.
 */
import { computed, ref } from 'vue'
import RsButton from './RsButton.vue'

const props = defineProps<{ modelValue: string; generated: string; problem?: string | null; label?: string; rows?: number }>()
const emit = defineEmits<{ 'update:modelValue': [text: string] }>()
const editing = ref(false)
const edited = computed(() => props.modelValue.trim() !== props.generated.trim())
function reset() {
  emit('update:modelValue', props.generated)
  editing.value = false
}
</script>

<template>
  <div class="et">
    <div class="head">
      <span class="lbl">{{ label ?? 'What will be written' }}<span v-if="edited" class="tag">edited</span></span>
      <span class="btns">
        <RsButton v-if="!editing" size="sm" @click="editing = true">Edit</RsButton>
        <RsButton v-else size="sm" variant="quiet" @click="editing = false">Done editing</RsButton>
        <RsButton v-if="edited" size="sm" variant="quiet" @click="reset">Reset to what the wizard wrote</RsButton>
      </span>
    </div>
    <textarea v-if="editing" class="box" :rows="rows ?? 10" spellcheck="false" :value="modelValue" aria-label="Text to write" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" />
    <pre v-else class="box">{{ modelValue }}</pre>
    <p v-if="problem" class="bad" role="alert">{{ problem }}</p>
  </div>
</template>

<style scoped>
.et { display: flex; flex-direction: column; gap: var(--rs-space-2); }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--rs-space-2); }
.lbl { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.tag { margin-left: 8px; padding: 1px 8px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-pill); font-weight: normal; color: var(--rs-text-strong); }
.btns { display: flex; flex-wrap: wrap; gap: 6px; }
.box { margin: 0; width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font-family: var(--rs-font-code); font-size: var(--rs-text-xs); line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
textarea.box { resize: vertical; }
.bad { margin: 0; padding: 8px 12px; border-radius: var(--rs-radius-md); border: 1.5px solid var(--rs-danger); color: var(--rs-danger); font-size: var(--rs-text-sm); }
</style>
