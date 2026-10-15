<script setup lang="ts">
/** The materials a tool offers when a job starts, as an editable table (wizard and editor). */
import { computed } from 'vue'
import { MAT_COLS, type MatRow } from './form'
import './forms.css'

const props = withDefaults(defineProps<{ rows: MatRow[]; type: string; names?: string[]; editable?: boolean }>(), { names: () => [], editable: true })
const emit = defineEmits<{ remove: [i: number]; add: [] }>()
const cols = computed(() => MAT_COLS[props.type] ?? [])
const listId = `mat-${Math.random().toString(36).slice(2, 7)}`
</script>

<template>
  <div class="mt">
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th v-for="[k, l] in cols" :key="k">{{ l }}</th>
          <th v-if="editable" class="x"><span class="visually-hidden">Remove</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i">
          <td>
            <input v-if="editable" v-model="r.name" class="tm-in code" maxlength="32" :list="names.length ? listId : undefined" aria-label="Material name" placeholder="PLYWOOD" @input="r.name = String(r.name).toUpperCase()" />
            <span v-else class="name">{{ r.name }}</span>
          </td>
          <td v-for="[k, l] in cols" :key="k"><input v-model="r[k]" class="tm-in num" type="number" step="any" :aria-label="`${r.name || 'material'} ${l}`" /></td>
          <td v-if="editable" class="x"><button type="button" class="tm-link danger" :aria-label="`Remove ${r.name || 'material'}`" @click="emit('remove', i)">Remove</button></td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="cols.length + 2" class="empty">No materials yet.</td></tr>
      </tbody>
    </table>
    <datalist v-if="names.length" :id="listId"><option v-for="n in names" :key="n" :value="n" /></datalist>
    <button v-if="editable" type="button" class="tm-link" @click="emit('add')">+ Add a material</button>
  </div>
</template>

<style scoped>
.mt { display: flex; flex-direction: column; gap: var(--rs-space-2); overflow-x: auto; }
table { width: auto; border-collapse: collapse; }
th { text-align: left; font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding: 0 6px 6px 0; }
td { padding: 3px 6px 3px 0; }
.num { width: 110px; text-align: right; font-variant-numeric: tabular-nums; }
td:first-child .tm-in { width: 220px; }
.x { width: 1%; white-space: nowrap; }
.name { font-family: var(--rs-font-code); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.empty { color: var(--rs-text-muted); font-size: var(--rs-text-sm); padding: 8px 0; }
.mt > .tm-link { align-self: flex-start; }
</style>
