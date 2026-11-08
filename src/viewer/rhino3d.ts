/**
 * The hologram's rhino in 3D: an original model, built here from smooth lofted shapes (Mike, Nov 7). Being solid, it's
 * seen from behind as it runs away round the right of the dial and head-on as it comes down the left.
 *
 * Proportions follow a white rhino: a deep barrel body on short, thick, columnar legs, a hump over the shoulders, the
 * rump lower and narrower than the shoulders, a long head carried low with a big front horn and a smaller one behind it,
 * tube ears, and a thin tail. Sizes are in shoulder heights: the hump's top is 1, the feet stand on 0, it faces +x, and
 * +z is up (the scene's way up).
 *
 * The joints take runner.ts's poses, the same numbers the trot was tuned with: each leg swings at the hip and folds at
 * the knee, the body tips around the back hips and rises, and the head nods at the neck.
 *
 * It's drawn as light: see-through turquoise, brighter at its edges and along its back, fading towards the feet, with
 * scan lines. A depth pass first keeps only its nearest surface, so the parts don't show through each other.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LessEqualDepth,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three'
import type { Pose } from './runner'

/** One cross-section of a loft: at `x`, from `bottom` to `top`, `w` either side of `y` */
export interface Station {
  x: number
  bottom: number
  top: number
  w: number
  y?: number
}

/** Catmull-Rom between stations, so the outline is smooth rather than a string of straight pieces */
function smooth(st: Station[], steps: number): Station[] {
  if (st.length < 3) return st
  const out: Station[] = []
  const keys: Array<keyof Station> = ['x', 'bottom', 'top', 'w', 'y']
  for (let i = 0; i < st.length - 1; i++) {
    const p0 = st[Math.max(i - 1, 0)]!
    const p1 = st[i]!
    const p2 = st[i + 1]!
    const p3 = st[Math.min(i + 2, st.length - 1)]!
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      const t2 = t * t
      const t3 = t2 * t
      const s = {} as Station
      for (const key of keys) {
        const a = p0[key] ?? 0
        const b = p1[key] ?? 0
        const c = p2[key] ?? 0
        const d = p3[key] ?? 0
        ;(s as unknown as Record<string, number>)[key] = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      }
      out.push(s)
    }
  }
  out.push(st[st.length - 1]!)
  return out
}

/**
 * A closed skin through the stations, along x. Each section is a superellipse (`round` 2 is an ellipse; more is boxier,
 * as a rhino's barrel is), and the two ends close to a point.
 */
export function loft(stations: Station[], opts: { around?: number; steps?: number; round?: number } = {}): BufferGeometry {
  const around = opts.around ?? 18
  const round = opts.round ?? 2.4
  const st = smooth(stations, opts.steps ?? 4)
  const pos: number[] = []
  const idx: number[] = []
  for (const s of st) {
    const mid = (s.top + s.bottom) / 2
    const half = (s.top - s.bottom) / 2
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2
      const c = Math.cos(a)
      const n = Math.sin(a)
      const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / round)
      const sz = Math.sign(n) * Math.pow(Math.abs(n), 2 / round)
      pos.push(s.x, (s.y ?? 0) + Math.max(s.w, 0) * sx, mid + half * sz)
    }
  }
  for (let i = 0; i < st.length - 1; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j
      const b = i * around + ((j + 1) % around)
      const c = a + around
      const d = b + around
      idx.push(a, c, b, b, c, d)
    }
  }
  // close both ends on their centres
  const first = st[0]!
  const last = st[st.length - 1]!
  const f = pos.length / 3
  pos.push(first.x, first.y ?? 0, (first.top + first.bottom) / 2)
  const l = f + 1
  pos.push(last.x, last.y ?? 0, (last.top + last.bottom) / 2)
  const lastRing = (st.length - 1) * around
  for (let j = 0; j < around; j++) {
    idx.push(f, j, (j + 1) % around)
    idx.push(l, lastRing + ((j + 1) % around), lastRing + j)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// ---- the shape ----------------------------------------------------------------------------------------------------

/**
 * Body, rear to front (Mike, Nov 7): short, a quarter shorter than a real white rhino's, with heavy shoulders and the
 * back sloping down to a small rump over short hind legs, a little like a hyena's. The rump (top 0.76, half-width 0.24)
 * sits well below and inside the shoulders (1.05, 0.37).
 */
export const BODY: Station[] = [
  { x: -0.433, bottom: 0.48, top: 0.58, w: 0.03 },
  { x: -0.393, bottom: 0.39, top: 0.69, w: 0.16 },
  { x: -0.314, bottom: 0.34, top: 0.76, w: 0.24 },
  { x: -0.195, bottom: 0.32, top: 0.8, w: 0.27 },
  { x: -0.024, bottom: 0.31, top: 0.85, w: 0.33 },
  { x: 0.108, bottom: 0.34, top: 0.95, w: 0.37 },
  { x: 0.28, bottom: 0.41, top: 1.05, w: 0.36 },
  { x: 0.44, bottom: 0.47, top: 1.02, w: 0.3 },
  { x: 0.58, bottom: 0.5, top: 0.92, w: 0.23 },
  { x: 0.7, bottom: 0.54, top: 0.84, w: 0.17 },
  { x: 0.76, bottom: 0.6, top: 0.78, w: 0.06 },
]
/** Head, from the neck joint forwards (before it's tipped nose-down): big, deep at the jaw, with a square muzzle */
const HEAD: Station[] = [
  { x: -0.06, bottom: -0.14, top: 0.12, w: 0.1 },
  { x: 0.04, bottom: -0.2, top: 0.16, w: 0.17 },
  { x: 0.18, bottom: -0.22, top: 0.14, w: 0.17 },
  { x: 0.32, bottom: -0.2, top: 0.09, w: 0.15 },
  { x: 0.46, bottom: -0.17, top: 0.05, w: 0.14 },
  { x: 0.56, bottom: -0.15, top: 0.03, w: 0.13 },
  { x: 0.61, bottom: -0.12, top: 0.0, w: 0.07 },
]
/** A horn: a cone from its base along x, curving up (it's turned to stand on the snout) */
function horn(length: number, base: number): BufferGeometry {
  const st: Station[] = []
  for (let i = 0; i <= 5; i++) {
    const k = i / 5
    const r = base * (1 - k) + 0.004
    const lift = 0.35 * length * k * k
    st.push({ x: length * k, bottom: lift - r, top: lift + r, w: r })
  }
  return loft(st, { around: 10, steps: 2, round: 2 })
}

/** Hips (back, right at the rump and shorter) and shoulders (front): where they join, and how long each half is */
export const LEG = {
  side: 0.14,
  back: { x: -0.3, hipZ: 0.42, upper: 0.22, lower: 0.2 },
  front: { x: 0.28, hipZ: 0.52, upper: 0.28, lower: 0.24 },
}
const NECK = { x: 0.66, z: 0.74, down: 0.42 }
/** The body tips around the back hips; rise is in the trot's own units, about a hundredth of the height */
const RISE_UNIT = 1 / 110

export interface Rhino3d {
  group: Group
  setPose(p: Pose): void
  /** how high each foot's sole is off the ground, in shoulder heights: [back far, back near, front far, front near] */
  feet(): number[]
  /** 0 normally; 1 for the tenth of a second it glitches */
  setGlitch(on: boolean): void
  /** where its feet stand (scene z) and how tall it is (scene units), for the fade towards the feet */
  setFrame(baseZ: number, height: number): void
  dispose(): void
}

const VERT = `
uniform float uGlitch;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 p = position;
  p.y += uGlitch * 0.05 * sin(p.z * 60.0);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vPosW = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`
const FRAG = `
uniform vec3 uColour;
uniform float uBaseZ;
uniform float uHeight;
uniform float uGlitch;
uniform float uBright;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float rim = pow(1.0 - abs(dot(n, v)), 2.2);
  float h = clamp((vPosW.z - uBaseZ) / uHeight, 0.0, 1.2);
  float fade = mix(0.35, 1.0, smoothstep(0.0, 0.7, h));
  float scan = 0.78 + 0.22 * step(0.5, fract(h * 22.0));
  float back = smoothstep(0.55, 0.95, n.z) * smoothstep(0.75, 0.95, h);
  float a = (0.28 + 1.1 * rim) * fade * scan * (1.0 - 0.6 * uGlitch) * uBright;
  vec3 c = uColour * a + vec3(1.0) * (0.45 * back + 0.35 * pow(rim, 5.0)) * fade * uBright;
  gl_FragColor = vec4(c, 1.0);
}`

/** Build the rhino in `colour` (CSS colour) */
export function buildRhino(colour: string): Rhino3d {
  const uniforms = {
    uColour: { value: new Color(colour) },
    uBaseZ: { value: 0 },
    uHeight: { value: 1 },
    uGlitch: { value: 0 },
    uBright: { value: 1 },
  }
  const light = new ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthFunc: LessEqualDepth, blending: AdditiveBlending })
  // the eye and the horn tip glow
  const glowUniforms = { ...uniforms, uBright: { value: 3 } }
  const glow = new ShaderMaterial({ uniforms: glowUniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthFunc: LessEqualDepth, blending: AdditiveBlending })
  // nudged a hair back: two shader programs needn't agree on depth to the last bit, and without this the light pass
  // fails against its own surface in specks
  const depth = new MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 })
  const geometries: BufferGeometry[] = []
  const materials: Material[] = [light, glow, depth]

  /** a part: drawn into depth first, then as light */
  function part(g: BufferGeometry, m: ShaderMaterial = light): Group {
    geometries.push(g)
    const holder = new Group()
    const d = new Mesh(g, depth)
    const l = new Mesh(g, m)
    d.frustumCulled = l.frustumCulled = false
    holder.add(d, l)
    return holder
  }

  const group = new Group()
  // the body hangs from the back hips, so tipping it rears it up round them
  const tipper = new Group()
  tipper.position.set(LEG.back.x, 0, LEG.back.hipZ)
  group.add(tipper)
  const body = new Group()
  body.position.set(-LEG.back.x, 0, -LEG.back.hipZ)
  tipper.add(body)
  body.add(part(loft(BODY, { around: 22, steps: 4, round: 2.5 })))

  // tail: thin, hanging from the top of the rump, with a tuft
  const tail = new Group()
  tail.position.set(-0.41, 0, 0.64)
  tail.rotation.y = 0.35 // hangs angled back
  tail.add(part(new CylinderGeometry(0.012, 0.018, 0.24, 6).translate(0, -0.12, 0).rotateX(Math.PI / 2)))
  const tuft = part(new SphereGeometry(0.03, 8, 6))
  tuft.position.set(0, 0, -0.25)
  tail.add(tuft)
  body.add(tail)

  // legs: [back far, back near, front far, front near], far on +y
  const legs: Array<{ hip: Group; knee: Group; lower: number }> = []
  for (const [y, front] of [
    [LEG.side, false],
    [-LEG.side, false],
    [LEG.side, true],
    [-LEG.side, true],
  ] as Array<[number, boolean]>) {
    const L = front ? LEG.front : LEG.back
    const hip = new Group()
    hip.position.set(L.x, y, L.hipZ)
    // the thigh or shoulder: a heavy mass that blends into the body and swings with the leg; the shoulders are the
    // heaviest part of it
    const mass = part(new SphereGeometry(1, 16, 12))
    mass.scale.set(front ? 0.16 : 0.12, front ? 0.11 : 0.08, front ? 0.21 : 0.13)
    mass.position.set(front ? 0.01 : -0.02, 0, 0)
    hip.add(mass)
    // upper leg: tapering from that mass to the knee
    hip.add(part(new CylinderGeometry(front ? 0.115 : 0.095, 0.085, L.upper, 12).translate(0, -L.upper / 2, 0).rotateX(Math.PI / 2)))
    const knee = new Group()
    knee.position.set(0, 0, -L.upper)
    knee.add(part(new SphereGeometry(0.088, 12, 8)))
    // lower leg: a column that widens a little to the foot, which sits flat on the ground
    knee.add(part(new CylinderGeometry(0.075, 0.085, L.lower - 0.03, 12).translate(0, -(L.lower - 0.03) / 2, 0).rotateX(Math.PI / 2)))
    const foot = part(new CylinderGeometry(0.075, 0.095, 0.05, 12).rotateX(Math.PI / 2))
    foot.position.set(0.01, 0, -L.lower + 0.025)
    knee.add(foot)
    hip.add(knee)
    body.add(hip)
    legs.push({ hip, knee, lower: L.lower })
  }

  // head: carried low from the neck, nose down
  const neck = new Group()
  neck.position.set(NECK.x, 0, NECK.z)
  body.add(neck)
  const head = new Group()
  neck.add(head)
  head.add(part(loft(HEAD, { around: 18, steps: 3, round: 2.6 })))
  const front = part(horn(0.34, 0.075))
  front.position.set(0.5, 0, 0.0)
  front.rotation.y = -1.25
  head.add(front)
  const tip = part(new SphereGeometry(0.014, 6, 4), glow)
  // the horn's own tip (0.34 along, 0.119 up), turned as the horn is
  tip.position.set(0.5 + 0.34 * Math.cos(1.25) - 0.119 * Math.sin(1.25), 0, 0.34 * Math.sin(1.25) + 0.119 * Math.cos(1.25))
  head.add(tip)
  const rear = part(horn(0.16, 0.055))
  rear.position.set(0.34, 0, 0.07)
  rear.rotation.y = -1.35
  head.add(rear)
  for (const side of [1, -1]) {
    const ear = part(new CylinderGeometry(0.016, 0.04, 0.13, 8).translate(0, 0.065, 0).rotateX(Math.PI / 2))
    ear.position.set(0.02, 0.1 * side, 0.13)
    ear.rotation.set(-0.45 * side, -0.35, 0)
    head.add(ear)
    const eye = part(new SphereGeometry(0.016, 8, 6), glow)
    eye.position.set(0.28, 0.14 * side, 0.04)
    head.add(eye)
  }

  function setPose(p: Pose) {
    tipper.rotation.y = -p.tip
    tipper.position.z = LEG.back.hipZ + p.rise * RISE_UNIT // the outer group is the scene's to place
    neck.rotation.y = NECK.down + p.nod
    p.legs.forEach((leg, i) => {
      const l = legs[i]!
      l.hip.rotation.y = -leg.swing
      l.knee.rotation.y = leg.fold
    })
  }

  return {
    group,
    setPose,
    feet() {
      group.updateMatrixWorld(true)
      const s = group.scale.z || 1
      return legs.map((l) => (l.knee.localToWorld(new Vector3(0, 0, -l.lower)).z - group.position.z) / s)
    },
    setGlitch(on) {
      uniforms.uGlitch.value = on ? 1 : 0
      glowUniforms.uGlitch.value = on ? 1 : 0
    },
    setFrame(baseZ, height) {
      uniforms.uBaseZ.value = baseZ
      uniforms.uHeight.value = height
    },
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
    },
  }
}
