/**
 * Navigation and UI icons on a 24x24 grid, same drawing rules as the
 * toolhead emblems (see toolheads.ts for the class names).
 */

export type NavIconId = 'dashboard' | 'camera' | 'prepare' | 'preview' | 'control' | 'pendant' | 'toolheads' | 'files' | 'mesh' | 'care' | 'style' | 'settings'

export const NAV_ICONS: Record<NavIconId, { title: string; body: string }> = {
  // A landscape screen with a status line along the top: the lock-screen dashboard
  dashboard: {
    title: 'Dashboard',
    body: `
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/>
      <path d="M6 8.5h4.5M13.5 8.5h1.5M18 8.5h.01"/>
      <path class="c" d="M6 16l3.5-3 3 2 2.5-2.5 3 3"/>`,
  },
  // A camera body with its lens
  camera: {
    title: 'Camera',
    body: `
      <path d="M3 8.2a2 2 0 0 1 2-2h2.3l1.6-2.2h6.2l1.6 2.2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <circle cx="12" cy="13" r="4"/>
      <circle class="f" cx="12" cy="13" r="1.3"/>`,
  },
  // Isometric block: the model you bring in
  prepare: {
    title: 'Prepare',
    body: `
      <path d="M12 2.5l8.5 4.9v9.8L12 22.1l-8.5-4.9V7.4z"/>
      <path d="M3.5 7.4l8.5 4.9 8.5-4.9M12 12.3v9.8"/>`,
  },
  // Stacked layers seen in perspective
  preview: {
    title: 'Preview',
    body: `
      <path d="M12 3.5l9 4.5-9 4.5-9-4.5z"/>
      <path d="M3 12.2l9 4.5 9-4.5M3 16.4l9 4.5 9-4.5"/>`,
  },
  // A jog pad: four arrows around a centre
  control: {
    title: 'Control',
    body: `
      <path d="M12 2.8l2.6 3H9.4zM12 21.2l2.6-3H9.4zM2.8 12l3-2.6v5.2zM21.2 12l-3-2.6v5.2z"/>
      <circle cx="12" cy="12" r="3.2"/>
      <circle class="f" cx="12" cy="12" r="1.1"/>`,
  },
  // A phone with a small jog cross: the pendant
  pendant: {
    title: 'Pendant',
    body: `
      <rect x="6" y="2.5" width="12" height="19" rx="2.5"/>
      <path d="M12 7.5v6M9 10.5h6"/>
      <path d="M10.5 18.2h3"/>`,
  },
  // Four mounts, one open for a new tool
  toolheads: {
    title: 'Assets',
    body: `
      <circle cx="7" cy="7" r="3.8"/>
      <circle cx="17" cy="7" r="3.8"/>
      <circle cx="7" cy="17" r="3.8"/>
      <path d="M17 13.2v7.6M13.2 17h7.6"/>`,
  },
  // A sheet of G-code with a folded corner
  files: {
    title: 'Files',
    body: `
      <path d="M5.5 2.5h9l4 4v15h-13z"/>
      <path d="M14.5 2.5v4h4"/>
      <path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4"/>`,
  },
  // A bed seen in perspective with a wavy line across it and probe points: the bed mesh
  mesh: {
    title: 'Bed mesh',
    body: `
      <path d="M2.8 16.8l5.4-9.6h13l-5.4 9.6z"/>
      <path class="c" d="M5.4 12.2c2.6-1.6 4.4 1.6 7 0s4.4 1.6 7 0"/>
      <circle class="f" cx="7.3" cy="14.6" r="1.05"/>
      <circle class="f" cx="12" cy="11.9" r="1.05"/>
      <circle class="f" cx="16.6" cy="9.5" r="1.05"/>
      <path d="M2.8 16.8v2.6h13v-2.6M15.8 19.4l5.4-9.6V7.2"/>`,
  },
  // An open-end wrench with a tick: preventive maintenance
  care: {
    title: 'Care',
    body: `
      <path d="M14.8 3.2a4.8 4.8 0 0 0-4.5 6.4l-6.6 6.6a1.9 1.9 0 0 0 2.7 2.7l6.6-6.6a4.8 4.8 0 0 0 6.4-4.5l-2.9 2.9-2.7-.6-.6-2.7z"/>
      <path class="c" d="M16 17.5l1.8 1.8 3.4-3.6"/>`,
  },
  // Three overlapping circles: colour and type
  style: {
    title: 'Style',
    body: `
      <circle cx="9" cy="9.5" r="5.5"/>
      <circle cx="15" cy="9.5" r="5.5"/>
      <circle cx="12" cy="14.8" r="5.5"/>`,
  },
  // Two sliders
  settings: {
    title: 'Settings',
    body: `
      <path d="M3 7.5h10M19 7.5h2M3 16.5h3M12 16.5h9"/>
      <circle cx="16" cy="7.5" r="2.8"/>
      <circle cx="9" cy="16.5" r="2.8"/>`,
  },
}
