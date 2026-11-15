/** invariants.md A2: only commands.ts may make a CheckedScript (approve and fromPrompt); nothing else casts to it. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|vue)$/.test(f) && !/\.test\.ts$/.test(f)) out.push(p)
  }
  return out
}

describe('CheckedScript is made in one place', () => {
  it('"as CheckedScript" appears only in src/control/commands.ts', () => {
    const src = join(__dirname, '..')
    const offenders = files(src).filter((p) => !p.endsWith('control/commands.ts') && /as CheckedScript\b/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
    const n = (readFileSync(join(src, 'control', 'commands.ts'), 'utf8').match(/as CheckedScript\b/g) ?? []).length
    expect(n).toBe(3) // approve, fromPrompt's RESPOND, fromPrompt's command
  })
})
