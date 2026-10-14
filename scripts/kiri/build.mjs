/**
 * Builds the Kiri:Moto engine that Rhino Studio slices with, into public/kiri/.
 *
 *   node scripts/kiri/build.mjs [path/to/grid-apps]
 *
 * The built files are committed, so nobody needs to run this to use Studio.
 * Run it only to update Kiri: set KIRI_COMMIT below, then
 *
 *   git clone https://github.com/GridSpace/grid-apps ../grid-apps
 *   cd ../grid-apps && git checkout <KIRI_COMMIT>
 *   ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --ignore-scripts && npm run webpack-ext
 *   cd - && node scripts/kiri/build.mjs ../grid-apps
 *
 * Kiri:Moto is MIT-licensed (c) Stewart Allen; its licence is copied next to
 * the bundles. Two changes are made to Kiri's output, both path fixes so the
 * engine works from any folder (Studio is served from ./ or /studio/): the
 * WebAssembly files are fetched next to the bundle instead of from /wasm/.
 */
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'

export const KIRI_COMMIT = 'd138275'

const here = path.dirname(new URL(import.meta.url).pathname)
const studio = path.resolve(here, '../..')
const src = path.resolve(process.argv[2] ?? path.join(studio, '../grid-apps'))
const out = path.join(studio, 'public/kiri')

const head = execSync('git rev-parse --short HEAD', { cwd: src }).toString().trim()
if (!head.startsWith(KIRI_COMMIT) && !process.env.KIRI_ANY_COMMIT) {
  throw new Error(`grid-apps is at ${head}, expected ${KIRI_COMMIT} (set KIRI_ANY_COMMIT=1 to build anyway)`)
}
const version = JSON.parse(await fs.readFile(path.join(src, 'package.json'), 'utf8')).version

// The entry lives inside the grid-apps tree so its imports resolve there.
await fs.mkdir(path.join(src, 'studio'), { recursive: true })
const entry = path.join(src, 'studio/entry.js')
await fs.writeFile(entry, (await fs.readFile(path.join(here, 'studio-entry.js'), 'utf8')).replace('__KIRI_VERSION__', `${version} (${head})`))

const rec = {
  absWorkingDir: src,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"prod"' },
  logLevel: 'warning',
  logOverride: { 'duplicate-class-member': 'silent', 'duplicate-object-key': 'silent', 'direct-eval': 'silent' },
  // same externals as grid-apps' own bin/esbuild.config.mjs
  external: ['module', 'node:module', './constants', './voronoi_structures', './voronoi_ctypes', '../thirdparty/jsbn',
    './collections', './voronoi_predicates', './voronoi_builder', './point_data', './segment_data', './cppgen',
    './voronoi_diagram', './voronoi'],
}

await fs.rm(out, { recursive: true, force: true })
await fs.mkdir(path.join(out, 'wasm'), { recursive: true })
const bundles = { 'kiri-studio.js': 'studio/entry.js', 'kiri-work.js': 'src/kiri/run/worker.js', 'kiri-pool.js': 'src/kiri/run/minion.js' }
for (const [file, from] of Object.entries(bundles)) {
  await build({ ...rec, entryPoints: [from], outfile: path.join(out, file) })
  let code = await fs.readFile(path.join(out, file), 'utf8')
  const before = code
  // "/wasm/kiri-geo.wasm" and "../wasm/manifold.wasm" become files next to this bundle
  code = code.replaceAll(/(["'`])(?:\.\.)?\/wasm\/([a-z0-9-]+\.wasm)\1/g, '(new URL("./wasm/$2",import.meta.url).href)')
  if (file === 'kiri-work.js' && code === before) throw new Error(`${file}: the /wasm/ path to rewrite was not found - check the Kiri version`)
  await fs.writeFile(path.join(out, file), code)
}
for (const w of ['kiri-geo.wasm', 'manifold.wasm']) await fs.copyFile(path.join(src, 'src/wasm', w), path.join(out, 'wasm', w))
await fs.copyFile(path.join(src, 'license.md'), path.join(out, 'LICENSE-kiri-moto.md'))
await fs.writeFile(path.join(out, 'VERSION'), `Kiri:Moto ${version}, GridSpace/grid-apps commit ${head}\n`)
for (const f of await fs.readdir(out)) {
  const s = await fs.stat(path.join(out, f))
  if (s.isFile()) console.log(`${f.padEnd(24)} ${(s.size / 1024).toFixed(0).padStart(6)} KB`)
}
