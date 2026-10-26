import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

// Hash history (#/prepare) so the built app runs from any static folder on
// the Pi without nginx rewrite rules.
/** /toolheads/... (before Assets, Oct 26) -> /assets/...; the exact pages first, then any tool's page. */
export const OLD_TOOLHEADS: [string, string][] = [
  ['/toolheads/wiring/connector', '/assets/connector'],
  ['/toolheads/wiring/pins', '/assets/pins'],
  ['/toolheads/wiring/hardware', '/assets/hardware'],
  ['/toolheads/hardware/new', '/assets/hardware/new'],
  ['/toolheads/setup/kinds', '/assets/kinds'],
  ['/toolheads/setup/lists', '/assets/materials'],
  ['/toolheads/new', '/assets/toolheads/new'],
  ['/toolheads', '/assets/toolheads'],
]
const OLD_TOOLHEADS_PATHS: RouteRecordRaw[] = [
  ...OLD_TOOLHEADS.map(([from, to]): RouteRecordRaw => ({ path: from, redirect: (r) => ({ path: to, query: r.query }) })),
  { path: '/toolheads/:name/edit', redirect: (r) => `/assets/toolheads/${encodeURIComponent(String(r.params.name))}/edit` },
  { path: '/toolheads/:name', redirect: (r) => `/assets/toolheads/${encodeURIComponent(String(r.params.name))}` },
]

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
    // Assets (was Toolheads; Mike, Oct 26): Toolheads (library, connector, kinds), Hardware (system hardware, board
    // pins), Parts (materials, nozzles, categories). Adding or editing a tool and Add hardware open full width.
    { path: '/assets/toolheads/new', component: () => import('./views/ToolWizardView.vue'), meta: { title: 'Add a toolhead', nav: '/assets' } },
    { path: '/assets/hardware/new', component: () => import('./views/toolheads/HardwareWizardView.vue'), meta: { title: 'Add hardware', nav: '/assets' } },
    { path: '/assets/toolheads/:name/edit', component: () => import('./views/ToolEditView.vue'), meta: { title: 'Edit toolhead', nav: '/assets' } },
    {
      path: '/assets',
      component: () => import('./views/toolheads/AssetsShell.vue'),
      meta: { nav: '/assets' },
      children: [
        { path: '', redirect: '/assets/toolheads' },
        { path: 'toolheads', component: () => import('./views/ToolheadsView.vue'), meta: { title: 'Toolheads' } },
        { path: 'toolheads/:name', component: () => import('./views/ToolPageView.vue'), meta: { title: 'Toolhead' } },
        { path: 'connector', component: () => import('./views/toolheads/ConnectorView.vue'), meta: { title: 'Tool connector' } },
        { path: 'kinds', component: () => import('./views/toolheads/KindsView.vue'), meta: { title: 'Kinds of tool' } },
        { path: 'hardware', component: () => import('./views/toolheads/HardwareView.vue'), meta: { title: 'System hardware' } },
        { path: 'pins', component: () => import('./views/toolheads/PinsView.vue'), meta: { title: 'Board pins and outputs' } },
        { path: 'materials', component: () => import('./views/toolheads/ToolListsView.vue'), props: { part: 'materials' }, meta: { title: 'Materials' } },
        { path: 'nozzles', component: () => import('./views/toolheads/ToolListsView.vue'), props: { part: 'nozzles' }, meta: { title: 'Nozzles' } },
        { path: 'categories', component: () => import('./views/toolheads/ToolListsView.vue'), props: { part: 'categories' }, meta: { title: 'Categories' } },
      ],
    },
    // Old addresses (bookmarks, links in notes): every /toolheads/... page has a new home
    ...OLD_TOOLHEADS_PATHS,
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
        { path: 'profiles', component: () => import('./views/settings/ProfilesView.vue'), meta: { title: 'Slice profiles', lead: 'Your slicing settings, saved on the Rhino so a cleared browser or a new host keeps them.' } },
        { path: 'software', component: () => import('./views/settings/SoftwareView.vue'), meta: { title: 'Software and updates', lead: 'What Studio runs on, and what it is built with.' } },
        { path: 'host', component: () => import('./views/settings/HostView.vue'), meta: { title: 'Host', heading: 'Host, restarts and backups', lead: 'Restart Klipper and services, reboot or shut down the host, back up and restore. Never during a job.' } },
        { path: 'logs', component: () => import('./views/settings/LogsView.vue'), meta: { title: 'Logs', lead: 'Klipper and Moonraker logs, and the last error in them.' } },
        { path: 'network', component: () => import('./views/settings/NetworkView.vue'), meta: { title: 'Network', lead: 'How this screen reaches the Rhino, and the Rhino’s own network.' } },
        { path: 'about', component: () => import('./views/settings/AboutView.vue'), meta: { title: 'About' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})
