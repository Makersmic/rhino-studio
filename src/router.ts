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
    { path: '/mesh', component: () => import('./views/BedMeshView.vue'), meta: { title: 'Bed mesh' } },
    { path: '/heightmap', redirect: '/mesh' },
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
    // Settings: a section menu like Care
    {
      path: '/settings',
      component: () => import('./views/settings/SettingsShell.vue'),
      meta: { nav: '/settings' },
      children: [
        { path: '', component: () => import('./views/settings/AppearanceView.vue'), meta: { title: 'Settings', heading: 'Appearance', lead: 'Day or night for this screen, and the colour theme every screen shares.' } },
        { path: 'connection', component: () => import('./views/settings/ConnectionView.vue'), meta: { title: 'Connection', lead: 'Where this screen finds Moonraker and the Rhino Portal.' } },
        { path: 'trust', component: () => import('./views/settings/TrustView.vue'), meta: { title: 'Trusted addresses', lead: 'Which screens Moonraker lets in (trusted_clients), the same list Mainsail uses.' } },
        { path: 'tools', component: () => import('./views/settings/ToolChangingView.vue'), meta: { title: 'Tool changing', lead: 'How this machine changes tools, and how Studio reads which one is mounted.' } },
        { path: 'cameras', component: () => import('./views/settings/CamerasView.vue'), meta: { title: 'Cameras', lead: 'The camera list in Moonraker, shared with every screen.' } },
        { path: 'software', component: () => import('./views/settings/SoftwareView.vue'), meta: { title: 'Software and updates', lead: 'What Studio runs on, and what it is built with.' } },
        { path: 'host', component: () => import('./views/settings/HostView.vue'), meta: { title: 'Host', heading: 'Host and restarts', lead: 'Restart Klipper and services, or reboot and shut down the host. Never during a job.' } },
        { path: 'logs', component: () => import('./views/settings/LogsView.vue'), meta: { title: 'Logs', lead: 'Klipper and Moonraker logs, and the last error in them.' } },
        { path: 'network', component: () => import('./views/settings/NetworkView.vue'), meta: { title: 'Network', lead: 'How this screen reaches the Rhino, and the Rhino’s own network.' } },
        { path: 'about', component: () => import('./views/settings/AboutView.vue'), meta: { title: 'About' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})
