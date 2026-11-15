/** Every guide Studio knows: the checklists (guide.ts) and the wizards (one file each). */
import { ESTOP } from './estop'
import { LEVEL } from './level'
import { GUIDES, type GuideDef } from './guide'

export const WIZARDS: GuideDef[] = [ESTOP, LEVEL]
export const ALL_GUIDES: GuideDef[] = [...GUIDES, ...WIZARDS]

export function findGuide(template: string | null | undefined): GuideDef | null {
  return ALL_GUIDES.find((g) => g.template === template) ?? null
}
