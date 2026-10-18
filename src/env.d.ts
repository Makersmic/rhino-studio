/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** package.json version, set by vite.config.ts */
declare const __APP_VERSION__: string
/** Libraries this build was made with (vite.config.ts) */
declare const __BUILT_WITH__: { name: string; version: string; licence: string; role: string }[]
