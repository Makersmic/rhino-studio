import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// base: './' makes the built app work from any folder (e.g. served by the Pi's
// nginx under /studio/) without rebuilding. The router uses hash history for
// the same reason: no server rewrite rules are needed.
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
})
