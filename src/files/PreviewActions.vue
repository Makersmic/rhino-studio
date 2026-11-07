<script setup lang="ts">
/**
 * The buttons beside a preview. Nothing here starts or sends by its own route: a
 * file on the Rhino starts through StartFile (control.startJob, the same check,
 * confirmation and wizard as Files), and a new file through Job setup's own send.
 */
import { computed } from 'vue'
import RsButton from '@/components/RsButton.vue'
import StartFile from '@/files/StartFile.vue'
import { useMachineStore } from '@/stores/machine'
import { usePrepareStore } from '@/stores/prepare'

defineProps<{ filePath: string | null }>()
const machine = useMachineStore()
const prep = usePrepareStore()
const firstProblem = computed(() => prep.blocked[0]?.label ?? null)
</script>

<template>
  <div class="actions">
    <StartFile v-if="filePath" :file-path="filePath" download />
    <template v-else-if="prep.result">
      <RsButton variant="primary" :disabled="!!prep.blocked.length || !machine.online || prep.sending != null" @click="prep.send()">
        {{ prep.sending != null ? `Sending ${Math.round(prep.sending * 100)}%` : 'Send to Rhino' }}
      </RsButton>
      <RsButton v-if="!prep.uploaded" :disabled="!!prep.blocked.length" @click="prep.download()">Download</RsButton>
      <span v-if="firstProblem" class="why">Job setup found a problem, so this can't be sent: {{ firstProblem }}</span>
      <span v-else-if="!machine.online" class="why">Connect to send.</span>
      <p v-if="prep.sendError" class="problem" role="alert">{{ prep.sendError }}</p>
      <p v-if="prep.sentPath" class="sent" role="status">
        Sent as <strong>{{ prep.sentPath }}</strong>
        <StartFile :file-path="prep.sentPath" files-link />
      </p>
    </template>
  </div>
</template>

<style scoped>
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); margin-bottom: var(--rs-space-3); }
.why { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.problem, .sent { flex-basis: 100%; margin: 0; font-size: var(--rs-text-sm); }
.sent { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); overflow-wrap: anywhere; }
</style>
