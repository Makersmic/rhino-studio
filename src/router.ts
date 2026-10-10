import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history (#/prepare) so the built app runs from any static folder on
// the Pi without nginx rewrite rules.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/prepare' },
    { path: '/prepare', component: () => import('./views/PrepareView.vue'), meta: { title: 'Prepare' } },
    { path: '/preview', component: () => import('./views/PreviewView.vue'), meta: { title: 'Preview' } },
    { path: '/device', component: () => import('./views/DeviceView.vue'), meta: { title: 'Device' } },
    { path: '/toolheads', component: () => import('./views/ToolheadsView.vue'), meta: { title: 'Toolheads' } },
    { path: '/files', component: () => import('./views/FilesView.vue'), meta: { title: 'Files' } },
    { path: '/style', component: () => import('./views/StyleGuideView.vue'), meta: { title: 'Style guide' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { title: 'Settings' } },
    { path: '/:pathMatch(.*)*', redirect: '/prepare' },
  ],
})
