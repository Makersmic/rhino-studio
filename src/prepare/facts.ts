/**
 * The high-level facts on Job setup's tool cards: what a toolhead makes, the
 * files it takes and the limits that decide whether a job fits. Nothing about
 * care or which slicer does the work: just the job.
 */
import type { Material } from '@/slicer/profiles'
import type { MachineInfo, Process } from '@/slicer/types'

export const PROCESS_LABEL: Record<Process, string> = {
  fdm: '3D printing',
  laser: 'Laser cutting',
  cnc: 'CNC milling',
  dragknife: 'Knife cutting',
}

export const PROCESS_ACTION: Record<Process, string> = {
  fdm: 'Start a 3D print',
  laser: 'Start a laser cut',
  cnc: 'Start a CNC job',
  dragknife: 'Start a knife cut',
}

/** PLYWOOD -> Plywood, SOFT_WOOD -> Soft wood; short codes (PLA, PETG) stay as they are */
export function prettyMaterial(name: string): string {
  if (name.length <= 4) return name
  const s = name.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const mm = (v: number) => `${Math.round(v)}`

export function toolFacts(tool: { name: string; process: Process }, materials: Material[], m: MachineInfo): Array<{ label: string; value: string }> {
  const names = [...new Set(materials.map((x) => prettyMaterial(x.name)))]
  const mats = names.length ? (names.length > 4 ? `${names.slice(0, 4).join(', ')} +${names.length - 4}` : names.join(', ')) : 'None in the table yet'
  const area = `${mm(m.workArea.x)} × ${mm(m.workArea.y)} mm`
  switch (tool.process) {
    case 'fdm': {
      const nozzles = [...new Set(materials.map((x) => x.nozzle).filter((n): n is number => !!n))].sort((a, b) => a - b)
      const paths = new Set(materials.map((x) => x.path).filter((p) => p !== undefined)).size
      return [
        { label: 'Files', value: 'STL · 3MF · OBJ' },
        { label: 'Build', value: `${area} × ${mm(m.travelMax[2] - 5)} high` },
        { label: 'Materials', value: mats },
        { label: 'Nozzle', value: nozzles.length ? `${nozzles.join(' / ')} mm${paths > 1 ? ` · ${paths} filament paths` : ''}` : '–' },
      ]
    }
    case 'laser':
      return [
        { label: 'Files', value: 'SVG · DXF, or a 3D model’s outline' },
        { label: 'Cut area', value: area },
        { label: 'Materials', value: mats },
      ]
    case 'dragknife':
      return [
        { label: 'Files', value: 'SVG · DXF, or a 3D model’s outline' },
        { label: 'Cut area', value: area },
        { label: 'Materials', value: mats },
      ]
    case 'cnc':
      return [
        { label: 'Files', value: 'STL · 3MF · OBJ' },
        { label: 'Stock', value: `up to ${area}` },
        { label: 'Materials', value: mats },
        { label: 'Zero', value: 'Stock front-left corner, top' },
      ]
  }
}
