/**
 * Navigation and UI icons on a 24x24 grid, same drawing rules as the
 * toolhead emblems (see toolheads.ts for the class names).
 */

export type NavIconId = 'prepare' | 'preview' | 'device' | 'toolheads' | 'files' | 'style' | 'settings'

export const NAV_ICONS: Record<NavIconId, { title: string; body: string }> = {
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
  // A dial with a needle: live machine status
  device: {
    title: 'Device',
    body: `
      <path d="M3.5 16.5a8.5 8.5 0 0 1 17 0"/>
      <path d="M12 16.5l4.2-5.2"/>
      <circle class="f" cx="12" cy="16.5" r="1.5"/>
      <path d="M5.6 10.4l1.2 1M12 7.5V9M18.4 10.4l-1.2 1"/>
      <path d="M2.5 20.5h19"/>`,
  },
  // Four mounts, one open for a new tool
  toolheads: {
    title: 'Toolheads',
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
