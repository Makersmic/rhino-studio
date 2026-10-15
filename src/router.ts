import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history (#/prepare) so the built app runs from any static folder on
// the Pi without nginx rewrite rules.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: 'Dashboard', ownAlerts: true, lookOnly: true } },
    { path: '/setup', component: () => import('./views/PrepareView.vue'), meta: { title: 'Job setup' } },
    { path: '/prepare', redirect: '/setup' },
    { path: '/preview', component: () => import('./views/PreviewView.vue'), meta: { title: 'Preview' } },
    { path: '/control', component: () => import('./views/ControlView.vue'), meta: { title: 'Control' } },
    { path: '/device', redirect: '/control' },
    { path: '/pendant', component: () => import('./views/PendantView.vue'), meta: { title: 'Pendant', bare: true } },
    { path: '/toolheads', component: () => import('./views/ToolheadsView.vue'), meta: { title: 'Toolheads' } },
    { path: '/toolheads/new', component: () => import('./views/ToolWizardView.vue'), meta: { title: 'Add a toolhead', nav: '/toolheads' } },
    { path: '/toolheads/:name', component: () => import('./views/ToolPageView.vue'), meta: { title: 'Toolhead', nav: '/toolheads' } },
    { path: '/toolheads/:name/edit', component: () => import('./views/ToolEditView.vue'), meta: { title: 'Edit toolhead', nav: '/toolheads' } },
    { path: '/files', component: () => import('./views/FilesView.vue'), meta: { title: 'Files' } },
    { path: '/care', component: () => import('./views/CareView.vue'), meta: { title: 'Care' } },
    { path: '/style', component: () => import('./views/StyleGuideView.vue'), meta: { title: 'Style guide' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { title: 'Settings' } },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})
