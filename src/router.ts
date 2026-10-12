import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history (#/prepare) so the built app runs from any static folder on
// the Pi without nginx rewrite rules.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/prepare' },
    { path: '/prepare', component: () => import('./views/PrepareView.vue'), meta: { title: 'Prepare' } },
    { path: '/preview', component: () => import('./views/PreviewView.vue'), meta: { title: 'Preview' } },
    { path: '/control', component: () => import('./views/ControlView.vue'), meta: { title: 'Control' } },
    { path: '/device', redirect: '/control' },
    { path: '/pendant', component: () => import('./views/PendantView.vue'), meta: { title: 'Pendant', bare: true } },
    { path: '/toolheads', component: () => import('./views/ToolheadsView.vue'), meta: { title: 'Toolheads' } },
    { path: '/files', component: () => import('./views/FilesView.vue'), meta: { title: 'Files' } },
    { path: '/care', component: () => import('./views/CareView.vue'), meta: { title: 'Care' } },
    { path: '/style', component: () => import('./views/StyleGuideView.vue'), meta: { title: 'Style guide' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { title: 'Settings' } },
    { path: '/:pathMatch(.*)*', redirect: '/prepare' },
  ],
})
