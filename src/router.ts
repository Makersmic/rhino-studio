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
    // Toolheads: a section menu (library, wiring, setup). Adding and editing a tool open full width.
    { path: '/toolheads/new', component: () => import('./views/ToolWizardView.vue'), meta: { title: 'Add a toolhead', nav: '/toolheads' } },
    {
      path: '/toolheads',
      component: () => import('./views/toolheads/ToolheadsShell.vue'),
      meta: { nav: '/toolheads' },
      children: [
        { path: '', component: () => import('./views/ToolheadsView.vue'), meta: { title: 'Toolheads' } },
        { path: 'wiring/connector', component: () => import('./views/toolheads/ConnectorView.vue'), meta: { title: 'Tool connector' } },
        { path: 'wiring/pins', component: () => import('./views/toolheads/PinsView.vue'), meta: { title: 'Board pins and outputs' } },
        { path: 'wiring/hardware', component: () => import('./views/toolheads/HardwareView.vue'), meta: { title: 'System hardware' } },
        { path: 'setup/kinds', component: () => import('./views/toolheads/KindsView.vue'), meta: { title: 'Kinds of tool' } },
        { path: 'setup/lists', component: () => import('./views/toolheads/ToolListsView.vue'), meta: { title: 'Materials, nozzles, categories' } },
        { path: ':name', component: () => import('./views/ToolPageView.vue'), meta: { title: 'Toolhead' } },
      ],
    },
    { path: '/toolheads/:name/edit', component: () => import('./views/ToolEditView.vue'), meta: { title: 'Edit toolhead', nav: '/toolheads' } },
    { path: '/files', component: () => import('./views/FilesView.vue'), meta: { title: 'Files' } },
    // Care: a section menu (overview, tasks, library, log, meters, setup)
    {
      path: '/care',
      component: () => import('./views/care/CareShell.vue'),
      meta: { nav: '/care' },
      children: [
        { path: '', component: () => import('./views/CareView.vue'), meta: { title: 'Care' } },
        { path: 'tasks', component: () => import('./views/care/TasksView.vue'), meta: { title: 'Care tasks' } },
        { path: 'tasks/new', component: () => import('./views/care/TaskEditView.vue'), meta: { title: 'New task', mode: 'task' } },
        { path: 'tasks/:id', component: () => import('./views/care/TaskEditView.vue'), meta: { title: 'Task', mode: 'task' } },
        { path: 'library', component: () => import('./views/care/LibraryView.vue'), meta: { title: 'Task Library' } },
        { path: 'library/new', component: () => import('./views/care/TaskEditView.vue'), meta: { title: 'New library task', mode: 'template' } },
        { path: 'library/:id', component: () => import('./views/care/TaskEditView.vue'), meta: { title: 'Library task', mode: 'template' } },
        { path: 'log', component: () => import('./views/care/WorkLogView.vue'), meta: { title: 'Work log' } },
        { path: 'meters', component: () => import('./views/care/MetersView.vue'), meta: { title: 'Usage meters' } },
        { path: 'setup/statuses', component: () => import('./views/care/StatusCodesView.vue'), meta: { title: 'Status codes' } },
        { path: 'setup/lists', component: () => import('./views/care/CareListsView.vue'), meta: { title: 'Areas, kinds and priorities' } },
      ],
    },
    { path: '/style', component: () => import('./views/StyleGuideView.vue'), meta: { title: 'Style guide' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { title: 'Settings' } },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})
