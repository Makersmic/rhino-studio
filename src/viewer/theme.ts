/** Reading the theme's ink and paper for three.js, and noticing when the theme changes */
import type { Rgb } from './scene'

/** Any CSS colour as sRGB numbers: the browser does the converting, including color-mix() */
export function colourOf(css: string): Rgb {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return { r: 0.5, g: 0.5, b: 0.5 }
  g.fillStyle = css
  g.fillRect(0, 0, 1, 1)
  const d = g.getImageData(0, 0, 1, 1).data
  return { r: d[0]! / 255, g: d[1]! / 255, b: d[2]! / 255 }
}

/** Calls back when the theme changes; returns how to stop */
export function watchTheme(onChange: () => void): () => void {
  const attr = new MutationObserver(onChange)
  attr.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const system = window.matchMedia('(prefers-color-scheme: dark)')
  system.addEventListener('change', onChange)
  return () => {
    attr.disconnect()
    system.removeEventListener('change', onChange)
  }
}

const REDUCED_KEY = 'rs.viewer.reduced'
/** The lighter drawing choice, per screen. A two-core machine, such as the kiosk, starts in it. */
export function loadReduced(): boolean {
  try {
    const v = localStorage.getItem(REDUCED_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* storage blocked: fall through to the guess */
  }
  return (navigator.hardwareConcurrency || 4) <= 2
}
export function saveReduced(on: boolean): void {
  try {
    localStorage.setItem(REDUCED_KEY, on ? '1' : '0')
  } catch {
    /* storage blocked: it still applies to this view */
  }
}
