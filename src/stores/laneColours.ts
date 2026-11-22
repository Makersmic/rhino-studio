/**
 * The lane colours picked in the style guide (prepare/laneColours.ts): kept in this browser, put on the page's root as `--rs-lane-N` so
 * everything that draws a lane follows, and announced to the 3D Preview, which reads them itself.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { LANE_COLOURS_EVENT, LANE_COLOURS_KEY, cleanColours } from '@/prepare/laneColours'

function load(): (string | null)[] {
  try {
    return cleanColours(JSON.parse(localStorage.getItem(LANE_COLOURS_KEY) ?? 'null'))
  } catch {
    return cleanColours(null)
  }
}

export const useLaneColoursStore = defineStore('laneColours', () => {
  /** the colour picked for each lane, or null for the look's own */
  const colours = ref<(string | null)[]>(load())

  function apply() {
    const root = document.documentElement
    colours.value.forEach((c, i) => {
      if (c) root.style.setProperty(`--rs-lane-${i + 1}`, c)
      else root.style.removeProperty(`--rs-lane-${i + 1}`)
    })
    window.dispatchEvent(new Event(LANE_COLOURS_EVENT))
  }
  function save() {
    try {
      localStorage.setItem(LANE_COLOURS_KEY, JSON.stringify(colours.value))
    } catch {
      /* private window or blocked storage: it just won't be remembered */
    }
  }
  /** Pick a lane's colour (null: back to the look's own) */
  function set(lane: number, colour: string | null) {
    if (lane < 0 || lane >= colours.value.length) return
    colours.value = colours.value.map((c, i) => (i === lane ? cleanColours([colour])[0] ?? null : c))
    save()
    apply()
  }
  function reset() {
    colours.value = cleanColours(null)
    save()
    apply()
  }
  return { colours, apply, set, reset }
})
