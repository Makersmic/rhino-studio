import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Fonts are bundled (SIL Open Font License), so the app works offline on the shop network.
// Archivo is variable in weight (100-900) and width (62-125%).
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/jetbrains-mono/400.css'

import './styles/tokens.css'
import './styles/base.css'

import App from './App.vue'
import { router } from './router'
import { brand, faviconDataUrl } from './brand/brand'

// Favicon and title come from brand.ts so renaming is a one-file change
const icon = document.createElement('link')
icon.rel = 'icon'
icon.type = 'image/svg+xml'
icon.href = faviconDataUrl()
document.head.appendChild(icon)
document.title = brand.name

createApp(App).use(createPinia()).use(router).mount('#app')
