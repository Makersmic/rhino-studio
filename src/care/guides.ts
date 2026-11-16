/** Every guide Studio knows: the checklists (guide.ts) and the wizards (one file each). */
import { ESTOP } from './estop'
import { LEVEL } from './level'
import { NOZZLE } from './nozzle'
import { RUNIN, RUNOUT } from './spindle'
import { UMBILICAL } from './umbilical'
import { ZBELT, ZSCREWS } from './zdrive'
import { GUIDES, type GuideDef } from './guide'

export const WIZARDS: GuideDef[] = [ESTOP, LEVEL, ZSCREWS, ZBELT, NOZZLE, RUNIN, RUNOUT, UMBILICAL]
export const ALL_GUIDES: GuideDef[] = [...GUIDES, ...WIZARDS]

export function findGuide(template: string | null | undefined): GuideDef | null {
  return ALL_GUIDES.find((g) => g.template === template) ?? null
}
