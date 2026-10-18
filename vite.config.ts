import { defineConfig } from 'vitest/config'
import type { ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * What Studio is built with, as installed when this build was made (Settings /
 * Software, "Built with"). These only change with a new Studio build.
 */
const LIBS: [string, string][] = [
  ['vue', 'Interface framework'],
  ['pinia', 'App state'],
  ['vue-router', 'Screens and links'],
  ['@fontsource-variable/archivo', 'Interface font (Archivo)'],
  ['@fontsource/jetbrains-mono', 'Positions and console font (JetBrains Mono)'],
  ['vite', 'Build tool'],
  ['typescript', 'Type checking'],
]
function installed(name: string): { name: string; version: string; licence: string } {
  try {
    const p = JSON.parse(readFileSync(new URL(`./node_modules/${name}/package.json`, import.meta.url), 'utf8')) as { version: string; license?: string }
    return { name, version: p.version, licence: p.license ?? '' }
  } catch {
    return { name, version: '?', licence: '' }
  }
}
function kiriVersion(): string {
  try {
    return readFileSync(new URL('./public/kiri/VERSION', import.meta.url), 'utf8').trim()
  } catch {
    return ''
  }
}
const builtWith = [
  ...LIBS.map(([n, role]) => ({ ...installed(n), role })),
  { name: 'Kiri:Moto engine', version: kiriVersion().replace(/^Kiri:Moto\s*/, '') || '?', licence: 'MIT', role: 'Slicing and toolpaths, in the browser' },
  { name: 'DSEG7 Classic', version: 'bundled', licence: 'OFL-1.1', role: 'Seven-segment readout font (bundled)' },
]

/**
 * During development the app runs on your PC (localhost:5173) but Moonraker
 * runs on the Pi. Browsers block that kind of cross-site connection unless
 * moonraker.conf lists your PC in cors_domains. Instead of changing the Pi,
 * the dev server forwards Moonraker's paths to the Pi itself, so to the
 * browser everything looks like one site.
 *
 * Point it at your machine with the MOONRAKER environment variable:
 *   MOONRAKER=http://192.168.1.50 npm run dev
 * Default: http://mainsailos.local (Mainsail's nginx forwards to Moonraker).
 *
 * For the mock Moonraker (no machine needed): npm run mock, then
 *   MOONRAKER=http://localhost:7125 npm run dev
 */
const target = process.env.MOONRAKER ?? 'http://mainsailos.local'

/**
 * The Rhino Portal (maintenance engine) runs on the same Pi, port 5000.
 * The app reaches it at /portal; set PORTAL to point somewhere else.
 */
const portalTarget = process.env.PORTAL ?? target.replace(/(:\d+)?\/?$/, ':5000')

// Moonraker accepts a websocket only when the Origin header matches its host
// (or cors_domains). Rewrite Origin to the target so the forwarded request
// looks like it came from Mainsail's own site.
const originFix: ProxyOptions = {
  target,
  changeOrigin: true,
  configure(proxy) {
    proxy.on('proxyReq', (req) => req.setHeader('origin', target))
    proxy.on('proxyReqWs', (req) => req.setHeader('origin', target))
  },
}

// base: './' makes the built app work from any folder (e.g. served by the
// Pi's nginx under /studio/) without rebuilding. The router uses hash history
// for the same reason: no server rewrite rules are needed.
export default defineConfig({
  base: './',
  plugins: [vue()],
  // Written into every job file Prepare makes (; Made by Rhino Studio <version>)
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILT_WITH__: JSON.stringify(builtWith) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/websocket': { ...originFix, ws: true },
      '/server': originFix,
      '/printer': originFix,
      '/machine': originFix,
      '/access': originFix,
      // Cameras: crowsnest streams that the Pi's nginx serves at /webcam/, /webcam2/ ...
      '^/webcam\\d*/': originFix,
      '/portal': {
        target: portalTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/portal/, '') || '/',
        configure(proxy) {
          // The Portal refuses writes whose Origin isn't its own host
          proxy.on('proxyReq', (req) => req.setHeader('origin', portalTarget))
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
