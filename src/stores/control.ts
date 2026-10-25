/**
 * Everything that sends commands to the machine, in one place:
 * the console, macro buttons, prompt buttons, jogging, heaters and jobs.
 *
 * Every path goes through src/control/commands.ts (check -> confirm ->
 * approve) or fromPrompt() for wizard buttons. Confirmations are shown by
 * ConfirmDialog.vue, which this store drives.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { speedScript, zStepScript, zResetScript, limitsScript, isTuningScript } from '@/control/tuning'
import { approve, check, fromPrompt, heaterScript, jogScript, type Axis, type CheckedScript, type ScriptCheck } from '@/control/commands'
import { PromptTracker, type Prompt, type PromptButton } from '@/control/prompts'
import { checkStart, type StartCheck } from '@/control/jobs'
import { feedBlock, feedScript, flowScript, pathBlock, pressureAdvanceScript } from '@/control/extruder'
import type { GcodeStoreEntry } from '@/moonraker/client'
import { useSettingsStore } from './settings'
import { useMachineStore } from './machine'

export interface ConsoleLine {
  id: number
  time: number
  kind: 'sent' | 'response' | 'error' | 'action' | 'note'
  text: string
}

export interface ConfirmRequest {
  title: string
  body: string
  /** Lines to show in mono, each with what it does */
  lines?: { text: string; reason: string }[]
  /** Instead of the lines: one big plain-language item (e.g. the tool being swapped to) */
  feature?: string
  confirmLabel: string
  tone: 'motion' | 'danger' | 'normal'
  resolve: (ok: boolean) => void
}

const MAX_LINES = 400
const UNLOCK_MS = 60_000

export const useControlStore = defineStore('control', () => {
  const machine = useMachineStore()
  const settings = useSettingsStore()

  // ---- console ------------------------------------------------------------
  const lines = ref<ConsoleLine[]>([])
  let lineId = 0
  function log(kind: ConsoleLine['kind'], text: string, time = Date.now() / 1000) {
    lines.value.push({ id: lineId++, time, kind, text })
    if (lines.value.length > MAX_LINES) lines.value.splice(0, lines.value.length - MAX_LINES)
  }

  // ---- prompts (Rhino wizards) ----------------------------------------------
  const tracker = new PromptTracker()
  const prompt = shallowRef<Prompt | null>(null)
  const promptBusy = ref(false)

  function onResponse(line: string, time?: number) {
    const isAction = /^\s*(\/\/\s*)?action:/.test(line)
    if (isAction) tracker.feed(line, time)
    else log(line.startsWith('!!') ? 'error' : 'response', line.replace(/^\/\/\s?/, ''), time)
    prompt.value = tracker.current()
  }

  function onStore(entries: GcodeStoreEntry[]) {
    lines.value = []
    for (const e of entries) {
      if (e.type === 'command') log('sent', e.message, e.time)
      else for (const l of e.message.split('\n')) onResponse(l, e.time)
    }
    log('note', 'Connected. Earlier lines are from Moonraker’s history.')
  }

  async function pressPromptButton(b: PromptButton) {
    if (promptBusy.value) return
    promptBusy.value = true
    let script: CheckedScript
    try {
      script = fromPrompt(b.command)
    } catch (e) {
      log('error', (e as Error).message)
      promptBusy.value = false
      return
    }
    // The wizard decides what's next; close ours so a stale question can't be pressed twice
    tracker.dismiss()
    prompt.value = null
    log('action', `${b.label}  →  ${b.command}`)
    try {
      await machine.runChecked(script)
    } catch (e) {
      log('error', (e as Error).message)
    } finally {
      promptBusy.value = false
    }
  }

  // ---- confirmations ----------------------------------------------------------
  const pendingConfirm = shallowRef<ConfirmRequest | null>(null)
  function confirm(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
    pendingConfirm.value?.resolve(false)
    return new Promise((resolve) => {
      pendingConfirm.value = {
        ...req,
        resolve: (ok) => {
          pendingConfirm.value = null
          resolve(ok)
        },
      }
    })
  }

  // ---- running commands -----------------------------------------------------
  const running = ref<string | null>(null)
  const jobActive = computed(() => machine.job.state === 'printing' || machine.job.state === 'paused')
  const macros = ref<Map<string, string>>(new Map())

  /** Klipper's commands with descriptions, for the console's suggestions */
  const help = ref<Map<string, string>>(new Map())
  function onHelp(h: Record<string, string>) {
    help.value = new Map(Object.entries(h).map(([k, v]) => [k.toUpperCase(), v]))
    for (const name of macros.value.keys()) if (help.value.has(name)) macros.value.set(name, help.value.get(name)!)
  }
  /** The gcode_macro objects Klipper has: the real list of macros */
  function onObjects(objects: string[]) {
    macros.value = new Map(
      objects.filter((o) => o.startsWith('gcode_macro ')).map((o) => {
        const name = o.slice('gcode_macro '.length).toUpperCase()
        return [name, help.value.get(name) ?? '']
      }),
    )
  }

  const RISK_TITLE: Record<string, string> = {
    motion: 'This moves the machine',
    power: 'This powers a tool',
    'tool-state': 'This changes the recorded toolhead',
    restart: 'This restarts Klipper',
    job: 'This starts or stops a job',
    internal: 'This runs an internal macro',
  }

  /**
   * Send a script: check it, ask if needed, then run it.
   * label: what to show in the console instead of the raw script (buttons).
   */
  async function send(
    script: string,
    opts: { label?: string; confirmBody?: string; confirmTitle?: string; confirmFeature?: string; confirmLabel?: string } = {},
  ): Promise<boolean> {
    // Stops always go; a restart may go while Klipper is shut down (that's how you recover)
    const recovery = /^\s*(FIRMWARE_RESTART|RESTART)\s*$/i.test(script) && machine.online
    if (!machine.klippyReady && !recovery && !/^\s*(M112|EMERGENCY_STOP)\b/i.test(script)) {
      log('error', 'Klipper is not ready')
      return false
    }
    const c: ScriptCheck = check(script, { jobActive: jobActive.value, macros: new Set(macros.value.keys()) })
    if (c.blocked) {
      log('error', c.blocked)
      return false
    }
    let confirmed = false
    if (c.needsConfirm) {
      const flagged = c.lines.filter((l) => l.risk !== 'none' && l.risk !== 'heat')
      const worst = flagged.find((l) => l.risk === c.risk) ?? flagged[0]
      confirmed = await confirm({
        title: opts.confirmTitle ?? RISK_TITLE[worst?.risk ?? 'motion'] ?? 'Run this?',
        body:
          opts.confirmBody ??
          (jobActive.value ? 'A job is running. ' : '') + 'Check the machine is clear and you are ready to stop it.',
        lines: c.lines.map((l) => ({ text: l.line, reason: l.reason })),
        feature: opts.confirmFeature,
        confirmLabel: opts.confirmLabel ?? 'Proceed',
        tone: c.risk === 'tool-state' || c.risk === 'restart' || jobActive.value ? 'danger' : 'motion',
      })
      if (!confirmed) {
        log('note', `Not sent: ${opts.label ?? c.script.split('\n')[0]}`)
        return false
      }
    }
    const approved = approve(c, confirmed)
    log('sent', opts.label ?? c.script)
    running.value = opts.label ?? c.lines[0]?.command ?? ''
    try {
      await machine.runChecked(approved)
      return true
    } catch (e) {
      log('error', (e as Error).message)
      return false
    } finally {
      running.value = null
    }
  }

  // ---- motion lock ----------------------------------------------------------
  const unlockedUntil = ref(0)
  const now = ref(Date.now())
  setInterval(() => (now.value = Date.now()), 1000)
  const motionUnlocked = computed(() => unlockedUntil.value > now.value)

  /**
   * Two-hand control (phone pendant): true only while the enable button is
   * physically held. Set by the pendant's pointer events, cleared on release,
   * cancel, screen off, app switch, and every motion block.
   */
  const enableHeld = ref(false)
  function setEnable(held: boolean) {
    enableHeld.value = held && !motionBlock.value
  }
  const unlockSecondsLeft = computed(() => Math.max(0, Math.ceil((unlockedUntil.value - now.value) / 1000)))

  /** Why jogging is unavailable, or null when it can be unlocked. */
  const motionBlock = computed(() => {
    if (!machine.klippyReady) return 'Klipper is not ready'
    if (jobActive.value) return 'A job is running'
    if (machine.toolState.kind === 'swapping') return 'A tool swap is in progress'
    if (!machine.mountedVerified) return 'Confirm the mounted toolhead first: tool lengths differ'
    return null
  })

  function unlockMotion() {
    if (motionBlock.value) return
    unlockedUntil.value = Date.now() + UNLOCK_MS
    now.value = Date.now()
  }
  function lockMotion() {
    unlockedUntil.value = 0
    enableHeld.value = false
  }
  // Relock when the screen turns off or you switch apps (phone pendant)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.hidden && lockMotion())
  // Relock the moment anything changes underneath
  watch(motionBlock, (b) => b && lockMotion())
  watch(() => machine.mountedName, lockMotion)

  async function jog(axis: Axis, delta: number) {
    // Either the Control screen's unlock or the pendant's held enable button
    if ((!motionUnlocked.value && !enableHeld.value) || motionBlock.value) return
    const j = jogScript(axis, delta, {
      position: machine.position.xyz,
      min: machine.limits.min,
      max: machine.limits.max,
      homed: machine.position.homed,
    })
    if ('error' in j) {
      log('error', `Jog ${axis}${delta > 0 ? '+' : ''}${delta}: ${j.error}`)
      return
    }
    if (motionUnlocked.value) unlockedUntil.value = Date.now() + UNLOCK_MS // each jog keeps it unlocked
    // Unlocking was the confirmation for jogs
    const c = check(j.script, { jobActive: false })
    log('sent', `Jog ${axis} ${delta > 0 ? '+' : ''}${delta} mm`)
    try {
      await machine.runChecked(approve(c, true))
    } catch (e) {
      log('error', (e as Error).message)
    }
  }

  /** Homing moves the head with whatever it holds; not while a tool sensor disagrees or a swap runs */
  const homeBlock = computed(() => {
    if (!machine.klippyReady) return 'Klipper is not ready'
    if (jobActive.value) return 'A job is running'
    if (machine.toolState.kind === 'swapping') return 'A tool swap is in progress'
    if (machine.toolState.kind === 'mismatch') return 'The tool sensor disagrees with the selected tool'
    return null
  })

  async function home(axes: 'all' | 'xy') {
    if (homeBlock.value) {
      log('error', `Not homed: ${homeBlock.value}`)
      return
    }
    const tool = machine.mountedName ?? 'no confirmed toolhead'
    await send(axes === 'all' ? 'G28' : 'G28 X Y', {
      label: axes === 'all' ? 'Home all' : 'Home X Y',
      confirmBody:
        axes === 'all'
          ? `Homes X and Y, then Z if a print head is confirmed (your G28 rules; ${tool} mounted). Clear the bed and keep a hand near Stop.`
          : 'Homes X and Y. Keep a hand near Stop.',
    })
  }

  async function motorsOff() {
    await send('M84', { label: 'Motors off', confirmBody: 'The motors lose holding power: the bed may drop under its own weight, and you will need to home again before jogging.' })
  }

  /**
   * Heater targets. The hotend heater output (HE0) stays wired when a laser,
   * spindle or knife is mounted, so a hotend target above 0 needs a verified
   * print head. Switching a heater off is always allowed.
   */
  const hotendSettable = computed(() => machine.toolState.kind === 'mounted' && machine.toolState.type === 'DEPOSITION')

  async function setHeater(heater: 'extruder' | 'heater_bed', target: number) {
    if (heater === 'extruder' && target > 0 && !hotendSettable.value) {
      log('error', 'Hotend not set: heating it needs a confirmed print head mounted.')
      return
    }
    const h = heaterScript(heater, target)
    if ('error' in h) {
      log('error', h.error)
      return
    }
    await send(h.script, { label: `${heater === 'extruder' ? 'Hotend' : 'Bed'} ${target > 0 ? `to ${target}°` : 'off'}` })
  }


  // ---- extruder block (src/control/extruder.ts) -----------------------------
  const feedCtx = computed(() => ({
    klippyReady: machine.klippyReady,
    printHead: machine.toolKind === 'print',
    mountedName: machine.mountedName,
    jobActive: jobActive.value,
    swapping: machine.toolState.kind === 'swapping',
  }))
  /** Why Extrude / Retract are dead right now, or null */
  const feedBlocked = computed(() => feedBlock({ ...feedCtx.value, ex: machine.extruder }))
  /** Why the SwitchFly path can't be changed, or null */
  const pathBlocked = computed(() => pathBlock(feedCtx.value))
  /** Flow and pressure advance: a print head and Klipper ready; live during a job */
  const tuneBlocked = computed(() => (!machine.klippyReady ? 'Klipper is not ready' : machine.toolKind !== 'print' ? 'Confirm a print head first' : null))

  // ---- live tuning (src/control/tuning.ts): a red padlock, no per-tap asking --
  const tuneUnlocked = ref(false)
  const tuningBlock = computed(() => {
    if (!machine.klippyReady) return 'Klipper is not ready'
    if (machine.toolKind !== 'print') return 'Confirm a print head first'
    return null
  })
  function lockTuning() {
    tuneUnlocked.value = false
  }
  function unlockTuning() {
    if (!tuningBlock.value) tuneUnlocked.value = true
  }
  watch(tuningBlock, (b) => b && lockTuning())
  watch(() => machine.mountedName, lockTuning)

  /** Unlocked is the confirmation; only scripts the tuning builders make go this way. */
  async function sendTuning(script: string, label: string): Promise<boolean> {
    if (!tuneUnlocked.value) return log('error', `${label}: unlock tuning first`), false
    if (tuningBlock.value) return log('error', `${label}: ${tuningBlock.value}`), false
    if (!isTuningScript(script)) return log('error', `${label}: not a tuning command`), false
    const c = check(script, { jobActive: jobActive.value, macros: new Set(macros.value.keys()) })
    const approved = approve(c, true)
    log('sent', label)
    try {
      await machine.runChecked(approved)
      return true
    } catch (e) {
      log('error', `${label}: ${(e as Error).message}`)
      return false
    }
  }
  function tuneBuilt(b: { script: string } | { error: string }, label: string) {
    if ('error' in b) return log('error', `${label}: ${b.error}`), Promise.resolve(false)
    return sendTuning(b.script, label)
  }
  const setSpeed = (p: number) => tuneBuilt(speedScript(p), `Speed ${Math.round(p)}%`)
  const zStep = (d: number) => tuneBuilt(zStepScript(d, machine.zOffset, machine.position.homed), `Z offset ${d > 0 ? '+' : ''}${d} mm`)
  const zReset = () => tuneBuilt(zResetScript(machine.zOffset, machine.position.homed), 'Z offset back to 0')
  const setLimits = (v: number | null, a: number | null) => tuneBuilt(limitsScript(v, a), v != null ? `Velocity ${v} mm/s` : `Acceleration ${a} mm/s²`)

  async function setFlow(percent: number) {
    if (tuneBlocked.value) return log('error', `Flow not set: ${tuneBlocked.value}`), false
    if (!tuneUnlocked.value) return log('error', 'Flow not set: unlock tuning first'), false
    const b = flowScript(percent)
    if ('error' in b) return log('error', b.error), false
    return send(b.script, { label: `Flow ${Math.round(percent)}%` })
  }

  async function setPressureAdvance(advance: number, smooth: number) {
    if (tuneBlocked.value) return log('error', `Pressure advance not set: ${tuneBlocked.value}`), false
    if (!tuneUnlocked.value) return log('error', 'Pressure advance not set: unlock tuning first'), false
    const b = pressureAdvanceScript(advance, smooth)
    if ('error' in b) return log('error', b.error), false
    return send(b.script, { label: `Pressure advance ${advance} s, smooth ${smooth} s` })
  }

  /**
   * Extrude / Retract. No confirmation (Mike, 2026-10-18): feedBlock() is the
   * gate, the script only moves E, and Klipper refuses a cold extrude anyway.
   */
  async function feed(direction: 'extrude' | 'retract', length: number, speedMmS: number) {
    const label = `${direction === 'extrude' ? 'Extrude' : 'Retract'} ${length} mm at ${speedMmS} mm/s`
    if (feedBlocked.value) return log('error', `${label}: ${feedBlocked.value}`), false
    const b = feedScript(direction, length, speedMmS)
    if ('error' in b) return log('error', b.error), false
    const c = check(b.script, { jobActive: false })
    if (c.blocked) return log('error', c.blocked), false
    log('sent', label)
    running.value = label
    try {
      await machine.runChecked(approve(c, true))
      return true
    } catch (e) {
      log('error', (e as Error).message)
      return false
    } finally {
      running.value = null
    }
  }

  /** SwitchFly path: SWITCH_T0 / SWITCH_T1, always confirmed (it moves Z, retracts, heats and purges). */
  async function switchPath(path: 0 | 1) {
    if (pathBlocked.value) return log('error', `Path not changed: ${pathBlocked.value}`), false
    if (machine.extruder.path === path) return true
    const mat = machine.extruder.pathMaterial[path]
    return send(`SWITCH_T${path}`, {
      label: `Switch to path ${path + 1} (T${path})`,
      confirmTitle: `Switch to T${path}?`,
      confirmFeature: `Path ${path + 1} · T${path}${mat ? ` · ${mat}` : ''}`,
      confirmBody:
        'SwitchFly lifts Z 5 mm, retracts, turns the selector servo, heats to the material’s temperature if needed, then loads and purges. ' +
        (mat ? `Material: ${mat}, as remembered for this path.` : 'No material is remembered for this path yet: the Rhino will ask which one is loaded.'),
      confirmLabel: `Switch to T${path}`,
    })
  }

  // ---- jobs ---------------------------------------------------------------
  function startCheck(path: string, fileTool: string | null | undefined): StartCheck {
    const tools = machine.knownTools
    return checkStart({
      path,
      fileTool,
      toolState: machine.toolState,
      jobState: machine.job.state,
      klippyReady: machine.klippyReady,
      toolTypes: new Map(tools.filter((t) => t.type).map((t) => [t.name, t.type!])),
      toolSlots: new Map(tools.map((t) => [t.name, t.slot])),
      macros: new Set(macros.value.keys()),
      autoTools: machine.adapter.style === 'automatic',
    })
  }

  async function startJob(path: string, fileTool: string | null | undefined, careNote: string | null) {
    const c = startCheck(path, fileTool)
    if (!c.ok || !c.method) {
      log('error', `Can't start ${path}: ${c.block}`)
      return false
    }
    const how =
      machine.adapter.style === 'automatic'
        ? 'Moonraker starts the file. The machine picks up the tools the file uses, as your start macro and the file say.'
        : c.method.kind === 'print'
        ? 'Moonraker starts the file. Its START_JOB line checks the toolhead again, homes and runs your start sequence.'
        : `Runs ${c.method.macro} FILE=${path}: the Rhino wizard walks you through its safety checks, work zero and test, then starts the job. Its questions appear here and in Mainsail.`
    const ok = await confirm({
      title: `Start ${path.split('/').pop()}?`,
      body: [how, ...c.warnings, careNote].filter(Boolean).join('\n\n'),
      confirmLabel: c.method.kind === 'print' ? 'Start job' : `Start ${c.method.macro}`,
      tone: 'motion',
    })
    if (!ok) {
      log('note', `Not started: ${path}`)
      return false
    }
    try {
      if (c.method.kind === 'print') {
        log('sent', `Start ${path}`)
        await machine.startPrint(path)
      } else {
        const script = `${c.method.macro} FILE=${path}`
        log('sent', script)
        await machine.runChecked(approve(check(script, { jobActive: false }), true))
      }
      return true
    } catch (e) {
      log('error', (e as Error).message)
      return false
    }
  }

  async function swapTo(slot: number, name: string) {
    // The Swap list is disabled in these states; refuse here too, whatever calls this
    const t = machine.toolState.kind
    const refuse = !machine.klippyReady
      ? 'Klipper is not ready'
      : jobActive.value
        ? 'Not while a job is running'
        : t === 'swapping'
          ? 'A tool swap is already under way'
          : t === 'mismatch'
            ? 'The tool sensor disagrees with the selected tool'
            : null
    if (refuse) return log('error', `Swap to ${name}: ${refuse}`), false
    const script = machine.adapter.swapScript(slot)
    // Machines that change tools themselves: the Swap list may skip the
    // confirmation when the user turned it off (Settings). Never on the Rhino,
    // never for the console, and the usual checks still apply.
    if (machine.adapter.style === 'automatic' && !settings.confirmSwaps) {
      if (!machine.klippyReady) return log('error', 'Klipper is not ready'), false
      const c = check(script, { jobActive: jobActive.value, macros: new Set(macros.value.keys()) })
      if (c.blocked) return log('error', c.blocked), false
      log('sent', `Swap to ${name}`)
      running.value = `Swap to ${name}`
      try {
        await machine.runChecked(approve(c, true))
        return true
      } catch (e) {
        log('error', (e as Error).message)
        return false
      } finally {
        running.value = null
      }
    }
    return send(script, {
      label: `Swap to ${name}`,
      confirmTitle: 'Tool Swap Ready',
      confirmLabel: 'Start',
      confirmFeature: name,
      confirmBody: machine.adapter.swapNote(name),
    })
  }

  async function pauseJob() {
    log('sent', 'Pause')
    try {
      await machine.pausePrint()
    } catch (e) {
      log('error', (e as Error).message)
    }
  }

  async function resumeJob() {
    const ok = await confirm({
      title: 'Resume the job?',
      body: 'The machine moves back to where it stopped and the tool powers back on.',
      confirmLabel: 'Resume',
      tone: 'motion',
    })
    if (!ok) return
    log('sent', 'Resume')
    try {
      await machine.resumePrint()
    } catch (e) {
      log('error', (e as Error).message)
    }
  }

  async function cancelJob() {
    const ok = await confirm({
      title: 'Cancel the job?',
      body: 'Runs CANCEL_PRINT: the job stops and the Rhino switches the tool off. It cannot be resumed.',
      confirmLabel: 'Cancel job',
      tone: 'danger',
    })
    if (!ok) return
    log('sent', 'Cancel job')
    try {
      await machine.cancelPrint()
    } catch (e) {
      log('error', (e as Error).message)
    }
  }

  // A lost connection or Klipper restart ends any question on screen
  watch(
    () => machine.klippyReady,
    (ready) => {
      if (!ready) {
        tracker.dismiss()
        prompt.value = null
        lockMotion()
      }
    },
  )

  return {
    startJob,
    swapTo,
    pauseJob,
    resumeJob,
    cancelJob,
    lines,
    log,
    prompt,
    promptBusy,
    pendingConfirm,
    homeBlock,
    running,
    macros,
    jobActive,
    motionUnlocked,
    enableHeld,
    setEnable,
    unlockSecondsLeft,
    motionBlock,
    onResponse,
    onStore,
    onHelp,
    onObjects,
    help,
    pressPromptButton,
    confirm,
    send,
    unlockMotion,
    lockMotion,
    jog,
    home,
    motorsOff,
    setHeater,
    hotendSettable,
    feedBlocked,
    pathBlocked,
    tuneBlocked,
    tuneUnlocked,
    tuningBlock,
    lockTuning,
    unlockTuning,
    setSpeed,
    zStep,
    zReset,
    setLimits,
    setFlow,
    setPressureAdvance,
    feed,
    switchPath,
    startCheck,
  }
})
