/**
 * Settings › Host › Klipper extras: the Rhino's own Klipper modules (Tool Manager 1.9.30, klipper_extras/), which
 * install.sh links into ~/klipper/klippy/extras. The Portal reports each link (GET /api/host/extras) and can remake
 * them (POST /api/host/extras/relink, a write). A missing link means Klipper refuses to start once a section of
 * that module is in the config, so this page says so before that happens.
 */
export interface HostExtra { name: string; file: string; linked: boolean; in_the_way: boolean }
export interface HostExtras { klipper_dir: string; found: boolean; all_linked: boolean; extras: HostExtra[] }

/** One line per module, and one summary line for the panel header. */
export function extrasSummary(x: HostExtras | null): { tone: 'ok' | 'warn' | 'muted'; text: string } {
  if (!x) return { tone: 'muted', text: 'Not read yet' }
  if (!x.extras.length) return { tone: 'muted', text: 'This Tool Manager ships no Klipper extras' }
  if (!x.found) return { tone: 'warn', text: `Klipper isn't at ${x.klipper_dir}, so the modules are not linked` }
  const missing = x.extras.filter((e) => !e.linked)
  if (!missing.length) return { tone: 'ok', text: `All ${x.extras.length} linked into Klipper` }
  const blocked = missing.filter((e) => e.in_the_way)
  return {
    tone: 'warn',
    text: blocked.length
      ? `${blocked.map((e) => e.file).join(', ')}: a file of someone else's is in the way; move it aside first`
      : `${missing.length} of ${x.extras.length} not linked: Klipper would refuse a section that needs them`,
  }
}
