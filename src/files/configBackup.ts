/**
 * Before a config file is saved over, copy it into config/studio_backups (made if missing) and keep the newest ten
 * copies of each file. Shared by the Files editor and the positions wizard, so a file saved either way can be got back.
 * Returns the copy's path, or null for a brand-new file (nothing to copy yet).
 */
import { BACKUP_DIR, backupPath, backupsToPrune, join } from './fileOps'

export interface FileApi {
  getDirectory(path: string): Promise<{ dirs: { dirname: string }[]; files: { filename: string }[] }>
  fileChange(method: string, params: Record<string, unknown>): Promise<unknown>
}

export async function backupConfigFile(machine: FileApi, rp: string, now: Date = new Date()): Promise<string | null> {
  const dirs = await machine.getDirectory('config')
  if (!dirs.dirs.some((d) => d.dirname === 'studio_backups')) await machine.fileChange('server.files.post_directory', { path: BACKUP_DIR })
  const dest = backupPath(rp, now)
  try {
    await machine.fileChange('server.files.copy', { source: rp, dest })
  } catch (e) {
    // a brand-new file has nothing to back up yet
    if (/not exist|not found|404/i.test((e as Error).message)) return null
    throw e
  }
  try {
    const l = await machine.getDirectory(BACKUP_DIR)
    for (const n of backupsToPrune(l.files.map((f) => f.filename), rp)) await machine.fileChange('server.files.delete_file', { path: join(BACKUP_DIR, n) })
  } catch {
    /* pruning is tidy-up only */
  }
  return dest
}
