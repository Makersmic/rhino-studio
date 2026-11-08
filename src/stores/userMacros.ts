/**
 * Your macros (Tool Manager 1.9.13): the list from the Portal, and running one. The logic is in
 * src/control/userMacros.ts; running builds the G-code for the machine as it is now and hands it to control.send, the
 * console's own check and confirm.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { buildMacro, type MacroDraft, type RunContext, type UserMacro } from '@/control/userMacros'
import { materialsFor } from '@/slicer/profiles'
import { useControlStore } from './control'
import { useMachineStore } from './machine'
import { useToolMgrStore } from './toolmgr'

export const useUserMacrosStore = defineStore('userMacros', () => {
  const tm = useToolMgrStore()
  const machine = useMachineStore()
  const control = useControlStore()

  const list = ref<UserMacro[]>([])
  const deleted = ref<Array<{ id: string; name: string; deleted_at: number }>>([])
  const error = ref<string | null>(null)
  /** false on a Tool Manager before 1.9.13 */
  const supported = ref(true)
  const loaded = ref(false)

  async function load() {
    try {
      const r = await tm.client().userMacros()
      if (!r) {
        supported.value = false
        list.value = []
      } else {
        supported.value = true
        list.value = r.macros
        deleted.value = r.deleted ?? []
        error.value = r.ok ? null : (r.error ?? 'The macros file can’t be read')
      }
    } catch (e) {
      error.value = (e as Error).message
    }
    loaded.value = true
  }

  async function save(id: string | null, draft: MacroDraft, rev: number): Promise<UserMacro> {
    const m = id ? await tm.client().saveMacro(id, draft, rev) : await tm.client().createMacro(draft)
    await load()
    return m
  }
  async function remove(id: string) {
    await tm.client().deleteMacro(id)
    await load()
  }
  async function undelete(id: string) {
    await tm.client().undeleteMacro(id)
    await load()
  }

  /** the mounted toolhead's material table, as Job setup reads it */
  const materials = computed(() => {
    const st = machine.status
    const a = (st['gcode_macro VARIABLES'] as Record<string, unknown> | undefined)?.toolheads
    const b = (st['gcode_macro CUSTOM_TOOLS'] as Record<string, unknown> | undefined)?.toolheads
    const table = a || b ? { ...((a as object) ?? {}), ...((b as object) ?? {}) } : null
    const tool = machine.mountedName
    return tool ? materialsFor(tool, table).list : []
  })

  function context(): RunContext {
    const ts = machine.toolState
    return {
      jobActive: control.jobActive,
      tool: machine.mountedName,
      toolConfirmed: machine.mountedVerified,
      printHead: ts.kind === 'mounted' && ts.type === 'DEPOSITION',
      homed: machine.position.homed,
      position: machine.position.xyz,
      min: machine.limits.min,
      max: machine.limits.max,
      materials: materials.value.map((m) => ({ key: m.key, name: m.name, hotend: m.extruderTemp ?? null, bed: m.bedTemp ?? null })),
      macros: new Set(control.macros.keys()),
    }
  }

  /** Build it for the machine as it is now; anything refused is said in the console, and nothing is sent */
  async function run(m: MacroDraft): Promise<boolean> {
    const r = buildMacro(m, context())
    if ('error' in r) {
      control.log('error', `${m.name}: ${r.error}`)
      return false
    }
    return control.send(r.script, { label: m.name })
  }

  /** for the mounted toolhead first, then the ones for any toolhead; others aren't offered */
  const forMounted = computed(() => {
    const tool = machine.mountedName
    const mine = list.value.filter((m) => tool && m.toolheads.includes(tool))
    const any = list.value.filter((m) => !m.toolheads.length)
    return [...mine, ...any]
  })

  return { list, deleted, error, supported, loaded, load, save, remove, undelete, run, context, forMounted, materials }
})
