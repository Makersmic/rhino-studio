<script setup lang="ts">
/** Print settings beyond the everyday ones, grouped the way Orca groups them. */
import NumField from './NumField.vue'
import FoldGroup from './FoldGroup.vue'
import type { FdmSettings } from '@/slicer/types'

defineProps<{ fdm: FdmSettings }>()
</script>

<template>
  <div class="adv">
    <FoldGroup title="Quality" note="line width, seam, wall order">
      <NumField v-model="fdm.lineWidth" label="Line width" unit="mm" :min="0" :max="fdm.nozzle * 2" :step="0.02" hint="0 = the nozzle size" />
      <label class="fld"><span>Layer start (seam)</span>
        <select v-model="fdm.seam">
          <option value="last">Where the last layer ended</option>
          <option value="center">Part centre</option>
          <option value="origin">Nearest the front-left corner</option>
          <option value="random">Random</option>
          <option value="spiral">Spiral</option>
        </select>
      </label>
      <label class="fld"><span>Wall order</span>
        <select v-model="fdm.wallOrder">
          <option value="in-out">Inside, then outside</option>
          <option value="out-in">Outside, then inside</option>
          <option value="alternate">Alternate each layer</option>
        </select>
      </label>
      <label class="fld"><span>Thin walls</span>
        <select v-model="fdm.thinWalls">
          <option value="off">Off</option>
          <option value="basic">Fill gaps</option>
          <option value="adaptive">Adaptive</option>
        </select>
      </label>
      <label class="check"><input v-model="fdm.adaptive" type="checkbox" /> Adaptive layer heights</label>
      <NumField v-if="fdm.adaptive" v-model="fdm.minLayer" label="Thinnest layer" unit="mm" :min="0.04" :max="fdm.layerHeight" :step="0.02" />
    </FoldGroup>

    <FoldGroup title="Strength" note="infill angle and overlap">
      <NumField v-model="fdm.fillAngle" label="Infill angle" unit="°" :min="0" :max="180" :step="5" />
      <NumField v-model="fdm.fillOverlap" label="Infill overlap" unit="%" :min="0" :max="1" :step="0.05" percent hint="Of a line width, into the walls" />
      <label class="check wide"><input v-model="fdm.vase" type="checkbox" /> Vase mode (one continuous wall, no top or infill)</label>
    </FoldGroup>

    <FoldGroup title="Speed" note="outer wall, travel, flow limit">
      <NumField v-model="fdm.outerSpeed" label="Outer wall" unit="mm/s" :min="5" :max="300" />
      <NumField v-model="fdm.travelSpeed" label="Travel" unit="mm/s" :min="20" :max="500" />
      <NumField v-model="fdm.minSpeed" label="Slowest" unit="mm/s" :min="1" :max="100" hint="For small layers" />
      <NumField v-model="fdm.maxFlow" label="Max flow" unit="mm³/s" :min="1" :max="60" hint="The hotend's limit" />
    </FoldGroup>

    <FoldGroup title="Retraction" note="speed, z-hop, wipe, coast">
      <NumField v-model="fdm.retractSpeed" label="Retract speed" unit="mm/s" :min="5" :max="100" />
      <NumField v-model="fdm.zHop" label="Z hop" unit="mm" :min="0" :max="3" :step="0.1" hint="0 = off" />
      <NumField v-model="fdm.wipe" label="Wipe" unit="mm" :min="0" :max="10" :step="0.5" />
      <NumField v-model="fdm.coast" label="Coast" unit="mm" :min="0" :max="10" :step="0.1" hint="Stop extruding early on walls" />
      <label class="check"><input v-model="fdm.retractEachLayer" type="checkbox" /> Retract at every layer change</label>
      <label class="check"><input v-model="fdm.avoidCrossing" type="checkbox" /> Travel around gaps instead of retracting</label>
    </FoldGroup>

    <FoldGroup title="Support" :note="fdm.supports ? 'on' : 'off (tick Supports above)'">
      <NumField v-model="fdm.supportAngle" label="Overhang angle" unit="°" :min="10" :max="85" />
      <NumField v-model="fdm.supportDensity" label="Density" unit="%" :min="0.05" :max="1" :step="0.05" percent />
      <NumField v-model="fdm.supportGapXY" label="Gap to the part" unit="mm" :min="0" :max="5" :step="0.1" hint="Sideways" />
      <label class="check"><input v-model="fdm.supportGapZ" type="checkbox" /> One layer gap above and below</label>
      <label class="check"><input v-model="fdm.supportOutline" type="checkbox" /> Outline each support</label>
    </FoldGroup>

    <FoldGroup title="Cooling" note="fan start, slowest layer">
      <NumField v-model="fdm.fanFromLayer" label="Fan from layer" :min="0" :max="20" hint="0 = the first" />
      <NumField v-model="fdm.minLayerTime" label="Shortest layer" unit="s" :min="0" :max="60" hint="Slows small layers so they cool" />
    </FoldGroup>

    <FoldGroup title="Bed adhesion" note="skirt or brim, raft">
      <NumField v-model="fdm.brim" label="Skirt loops" :min="0" :max="30" />
      <NumField v-model="fdm.skirtGap" label="Gap to the part" unit="mm" :min="0" :max="50" :step="0.5" hint="0 = a brim" />
      <label class="check"><input v-model="fdm.raft" type="checkbox" /> Raft</label>
      <NumField v-if="fdm.raft" v-model="fdm.raftSpacing" label="Raft gap" unit="mm" :min="0" :max="3" :step="0.05" />
    </FoldGroup>
  </div>
</template>

<style scoped>
.adv { margin-top: var(--rs-space-4); }
.fld { display: flex; flex-direction: column; gap: 4px; }
.fld > span { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
select { height: 38px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
.check { display: flex; align-items: center; gap: 8px; font-size: var(--rs-text-sm); align-self: end; min-height: 38px; }
.check input { width: 16px; height: 16px; accent-color: var(--rs-text-strong); }
</style>
