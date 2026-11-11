/**
 * The wizard mascot: Mike's rhino crew (Nov 10 2026), one PNG per pose in src/assets/wizard/, cut from his two sheets
 * by scripts/wizard_art.py. Ink only (black + alpha), drawn in the theme's ink colour by RsMascot.vue.
 * Every wizard picks its poses here, so a pose can be swapped in one place.
 */
import type { Step as ToolStep } from '@/toolmgr/form'

export const POSES = [
  'wrench', 'connect', 'spindle', 'laser', 'calipers', 'spool-sit', 'zapped', 'meter',
  'thumbsup', 'pipewrench', 'screwdriver', 'shocked', 'cable', 'spool', 'pendant', 'carry',
] as const
export type Pose = (typeof POSES)[number]

/** Add a toolhead: one pose per step */
export const TOOL_STEP_POSE: Record<ToolStep, Pose> = {
  Tool: 'carry',
  Outputs: 'cable',
  Connector: 'connect',
  Hardware: 'screwdriver',
  Limits: 'calipers',
  Materials: 'spool',
  Controls: 'meter',
  Macros: 'pipewrench',
  Review: 'thumbsup',
}

/** Tuning wizards: one pose per test (print head, laser, drag knife) */
export const TUNING_POSE: Record<string, Pose> = {
  extruder_calibration: 'calipers',
  first_layer: 'wrench',
  pressure_advance: 'screwdriver',
  extrusion_multiplier: 'spool-sit',
  laser_focus: 'carry',
  laser_cut: 'laser',
  laser_engrave: 'laser',
  laser_passes: 'carry',
  laser_kerf: 'calipers',
  knife_offset: 'pipewrench',
  knife_depth: 'calipers',
}

/** Done, and something went wrong (a refused save, a failed check) */
export const DONE_POSE: Pose = 'thumbsup'
export const TROUBLE_POSE: Pose = 'zapped'

const URLS = import.meta.glob('@/assets/wizard/rhino-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export function poseUrl(p: Pose): string {
  return Object.entries(URLS).find(([k]) => k.endsWith(`/rhino-${p}.png`))?.[1] ?? ''
}
