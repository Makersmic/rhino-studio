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
 * The shapes are blended into one smooth skin (Mike, Nov 7: "so I don't see the individual shapes"): a distance field,
 * polygonised once, and skinned to joints so it bends rather than coming apart. Horns and eyes ride on the head.
 *
 * It's drawn as light: see-through turquoise, brighter at its edges and along its back, fading towards the feet, with
 * scan lines. A depth pass first keeps only its nearest surface, so the far side doesn't show through.
 */
import {
  AdditiveBlending,
  Bone,
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  LessEqualDepth,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Uint16BufferAttribute,
  Vector3,
  type Material,
} from 'three'
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
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
 * Body, rear to front (Mike, Nov 7): a quarter shorter than a real white rhino's, with heavy shoulders and the back
 * sloping down to the rump. The rump (top 0.86, half-width 0.24) sits below and inside the shoulders (1.05, 0.37).
 */
export const BODY: Station[] = [
  { x: -0.433, bottom: 0.58, top: 0.68, w: 0.03 },
  { x: -0.393, bottom: 0.49, top: 0.79, w: 0.16 },
  { x: -0.314, bottom: 0.44, top: 0.86, w: 0.24 },
  { x: -0.195, bottom: 0.4, top: 0.88, w: 0.27 },
  { x: -0.024, bottom: 0.36, top: 0.9, w: 0.33 },
  { x: 0.108, bottom: 0.37, top: 0.98, w: 0.37 },
  { x: 0.28, bottom: 0.41, top: 1.05, w: 0.36 },
  { x: 0.44, bottom: 0.47, top: 1.02, w: 0.3 },
  { x: 0.58, bottom: 0.5, top: 0.92, w: 0.23 },
  { x: 0.7, bottom: 0.54, top: 0.84, w: 0.17 },
  { x: 0.76, bottom: 0.6, top: 0.78, w: 0.06 },
]
/**
 * Head, from the neck joint forwards (before it's tipped nose-down): big and deep at the jaw, waisted in the middle and
 * wide again at the square muzzle, a little like a barbell (Mike, Nov 7)
 */
const HEAD: Station[] = [
  { x: -0.06, bottom: -0.14, top: 0.12, w: 0.1 },
  { x: 0.04, bottom: -0.2, top: 0.16, w: 0.17 },
  { x: 0.18, bottom: -0.22, top: 0.14, w: 0.16 },
  { x: 0.3, bottom: -0.2, top: 0.1, w: 0.125 },
  { x: 0.4, bottom: -0.18, top: 0.07, w: 0.125 },
  { x: 0.5, bottom: -0.17, top: 0.05, w: 0.15 },
  { x: 0.57, bottom: -0.15, top: 0.03, w: 0.15 },
  { x: 0.615, bottom: -0.12, top: 0.0, w: 0.08 },
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

/** Hips (back, right at the rump) and shoulders (front): where they join, and how long each half is */
export const LEG = {
  side: 0.14,
  back: { x: -0.3, hipZ: 0.52, upper: 0.28, lower: 0.24 },
  front: { x: 0.28, hipZ: 0.52, upper: 0.28, lower: 0.24 },
}
/** where the head hangs from, and how far it tips nose-down (Mike, Nov 7: higher, further back, slanting down more) */
const NECK = { x: 0.6, z: 0.8, down: 0.62 }
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
#include <common>
#include <skinning_pars_vertex>
uniform float uGlitch;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vRest;
void main() {
  vRest = position;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  transformed.y += uGlitch * 0.05 * sin(transformed.z * 60.0);
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vPosW = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}`
const FRAG = `
uniform vec3 uColour;
uniform float uBaseZ;
uniform float uHeight;
uniform float uGlitch;
uniform float uBright;
uniform float uTexture;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vRest;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Wrinkled skin on the legs and face, in the rhino's own resting shape so it moves with it: rings round the legs,
// creases and a coarse mottle on the face. Returns the height; 1 - crease depth.
float skin(vec3 p) {
  float legs = 1.0 - smoothstep(0.3, 0.46, p.z);
  float face = smoothstep(0.62, 0.8, p.x);
  float wob = noise(p * 22.0);
  float rings = sin(p.z * 110.0 + 3.0 * wob);
  float legH = smoothstep(0.4, 1.0, rings) * (0.6 + 0.4 * noise(p * 8.0));
  float lines = sin(dot(p, vec3(52.0, 15.0, 75.0)) + 4.0 * noise(p * 12.0));
  float faceH = 0.75 * smoothstep(0.35, 1.0, lines) + 0.25 * noise(p * 28.0);
  return legs * legH + face * faceH;
}
void main() {
  vec3 n = normalize(vNormalW);
  float crease = 0.0;
  // how much of the rhino one pixel covers: once wrinkles would be finer than a few pixels, let them go, or they'd
  // only shimmer (on the Dashboard the rhino is small, so there it stays smooth)
  float detail = uTexture * (1.0 - smoothstep(0.009, 0.02, length(fwidth(vRest))));
  if (detail > 0.0) {
    // bump the normal by the skin's slope (Mikkelsen's surface gradient), so creases catch the light. Wrinkles are about
    // 0.009 shoulder heights deep; uHeight is the shoulder height in scene units
    float h = skin(vRest) * 0.009 * uHeight * detail;
    vec3 dpx = dFdx(vPosW);
    vec3 dpy = dFdy(vPosW);
    vec3 r1 = cross(dpy, n);
    vec3 r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    n = normalize(abs(det) * n - grad);
    crease = skin(vRest) * detail;
  }
  vec3 v = normalize(cameraPosition - vPosW);
  float rim = pow(1.0 - abs(dot(n, v)), 2.2);
  float h = clamp((vPosW.z - uBaseZ) / uHeight, 0.0, 1.2);
  float fade = mix(0.35, 1.0, smoothstep(0.0, 0.7, h));
  float scan = 0.78 + 0.22 * step(0.5, fract(h * 22.0));
  float back = smoothstep(0.55, 0.95, n.z) * smoothstep(0.75, 0.95, h);
  float a = (0.28 + 1.1 * rim) * fade * scan * (1.0 - 0.6 * uGlitch) * uBright * (1.0 - 0.2 * crease);
  vec3 c = uColour * a + vec3(1.0) * (0.45 * back + 0.35 * pow(rim, 5.0)) * fade * uBright;
  gl_FragColor = vec4(c, 1.0);
}`

// ---- the skin: the shapes as one smooth distance field, turned into one surface ----------------------------------

type V3 = [number, number, number]
/** A shape in its joint's own space: how far a point is outside it (negative inside), and how softly it blends in */
interface Shape {
  bone: number
  dist: (x: number, y: number, z: number) => number
  /** corners of a box round it, in the joint's space */
  box: [V3, V3]
  /** blend radius into what's already there (shoulder heights) */
  blend: number
  /** carved out of what's already there instead (a nostril) */
  cut?: boolean
}

/**
 * Distance to a cone with rounded ends from a (radius ra) to b (radius rb). After Inigo Quilez's distance functions,
 * https://iquilezles.org/articles/distfunctions/ (MIT licence).
 */
function roundCone(a: V3, b: V3, ra: number, rb: number): (x: number, y: number, z: number) => number {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const l2 = ba[0]! * ba[0]! + ba[1]! * ba[1]! + ba[2]! * ba[2]!
  const rr = ra - rb
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  return (x, y, z) => {
    const pa = [x - a[0], y - a[1], z - a[2]]
    const yy = pa[0]! * ba[0]! + pa[1]! * ba[1]! + pa[2]! * ba[2]!
    const zz = yy - l2
    const qx = pa[0]! * l2 - ba[0]! * yy
    const qy = pa[1]! * l2 - ba[1]! * yy
    const qz = pa[2]! * l2 - ba[2]! * yy
    const x2 = qx * qx + qy * qy + qz * qz
    const y2 = yy * yy * l2
    const z2 = zz * zz * l2
    const k = Math.sign(rr) * rr * rr * x2
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra
  }
}
/** Distance to an ellipsoid (a close estimate), after Inigo Quilez as above */
function ellipsoid(c: V3, r: V3): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    const px = (x - c[0]) / r[0]
    const py = (y - c[1]) / r[1]
    const pz = (z - c[2]) / r[2]
    const k0 = Math.hypot(px, py, pz)
    const k1 = Math.hypot(px / r[0], py / r[1], pz / r[2])
    return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1
  }
}
/** Distance to a loft (an estimate that's exact on the surface itself) */
function loftDist(stations: Station[], round: number): (x: number, y: number, z: number) => number {
  const st = smooth(stations, 4)
  const x0 = st[0]!.x
  const x1 = st[st.length - 1]!.x
  return (x, y, z) => {
    const cx = Math.min(Math.max(x, x0), x1)
    let i = 0
    let j = st.length - 1
    while (j - i > 1) {
      const m = (i + j) >> 1
      if (st[m]!.x <= cx) i = m
      else j = m
    }
    const A = st[i]!
    const B = st[j]!
    const t = B.x === A.x ? 0 : (cx - A.x) / (B.x - A.x)
    const w = Math.max(A.w + (B.w - A.w) * t, 1e-3)
    const top = A.top + (B.top - A.top) * t
    const bottom = A.bottom + (B.bottom - A.bottom) * t
    const half = Math.max((top - bottom) / 2, 1e-3)
    const cy = (A.y ?? 0) + ((B.y ?? 0) - (A.y ?? 0)) * t
    const q = Math.pow(Math.pow(Math.abs(y - cy) / w, round) + Math.pow(Math.abs(z - (top + bottom) / 2) / half, round), 1 / round)
    const across = (q - 1) * Math.min(w, half)
    const dx = Math.max(x0 - x, x - x1, 0)
    return dx > 0 ? Math.hypot(dx, Math.max(across, 0)) : across
  }
}
function loftBox(stations: Station[]): [V3, V3] {
  const w = Math.max(...stations.map((s) => s.w))
  return [
    [Math.min(...stations.map((s) => s.x)), -w, Math.min(...stations.map((s) => s.bottom))],
    [Math.max(...stations.map((s) => s.x)), w, Math.max(...stations.map((s) => s.top))],
  ]
}
function coneBox(a: V3, b: V3, r: number): [V3, V3] {
  return [
    [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
    [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
  ]
}
/** Blend b into a, rounding the join over `k` */
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/**
 * Skin folds on the body (Mike, Nov 7), as a rhino has: a ridge with a crease behind it running down and back behind
 * each shoulder, fading out before the belly, the same in front of each hind leg, and two folds round the neck. They're carved into the body's distance,
 * so they bend with the skin. Sizes in shoulder heights.
 */
export function bodyFolds(x: number, y: number, z: number): number {
  const g = (u: number, w: number) => Math.exp(-(u * u) / (w * w))
  // the shoulder and hip folds stay on the sides: none over the spine (Mike, Nov 7)
  const offSpine = Math.min(Math.max((Math.abs(y) - 0.08) / 0.12, 0), 1)
  // behind the shoulder: from high on the back (x 0.07) slanting back to behind the elbow (x 0.19)
  const xf = 0.07 + 0.12 * Math.min(Math.max((0.95 - z) / 0.5, 0), 1)
  const u = x - xf
  const sides = Math.min(Math.max((z - 0.36) / 0.12, 0), 1)
  const shoulder = (0.024 * g(u, 0.022) - 0.016 * g(u + 0.042, 0.02)) * sides * offSpine
  // in front of each hind leg, the same kind of fold slanting the other way: down and forwards round the thigh
  const xh = -0.2 + 0.08 * Math.min(Math.max((0.88 - z) / 0.42, 0), 1)
  const v = x - xh
  const hips = (0.02 * g(v, 0.02) - 0.014 * g(v - 0.038, 0.018)) * Math.min(Math.max((z - 0.44) / 0.12, 0), 1) * offSpine
  // round the neck
  const neck = 0.017 * g(x - 0.5, 0.018) - 0.01 * g(x - 0.535, 0.012) + 0.013 * g(x - 0.57, 0.016)
  return shoulder + hips + neck
}

/** How finely the skin is made: cells across the rhino's longest side */
export const SKIN_CELLS = 88

/**
 * Turn the shapes (each in its joint's space, the joints in their resting pose) into one skin in the rhino's space:
 * a smooth distance field, polygonised with three's MarchingCubes, then given skin weights so the joints bend it.
 */
function buildSkin(shapes: Shape[], joints: Bone[]): BufferGeometry {
  const toModel = joints.map((b) => b.matrixWorld.clone())
  const toJoint = toModel.map((m) => m.clone().invert())
  // each shape's box in the rhino's space, for skipping shapes far from a point
  const boxes = shapes.map((sh) => {
    const lo = new Vector3(Infinity, Infinity, Infinity)
    const hi = new Vector3(-Infinity, -Infinity, -Infinity)
    const [a, b] = sh.box
    for (const cx of [a[0], b[0]]) for (const cy of [a[1], b[1]]) for (const cz of [a[2], b[2]]) {
      const v = new Vector3(cx, cy, cz).applyMatrix4(toModel[sh.bone]!)
      lo.min(v)
      hi.max(v)
    }
    const pad = sh.blend + 0.03
    return { lo: lo.subScalar(pad), hi: hi.addScalar(pad) }
  })
  const lo = new Vector3(Infinity, Infinity, Infinity)
  const hi = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const b of boxes) {
    lo.min(b.lo)
    hi.max(b.hi)
  }
  const centre = lo.clone().add(hi).multiplyScalar(0.5)
  const half = hi.clone().sub(lo).multiplyScalar(0.5 * 1.04)
  const res = SKIN_CELLS
  const local = new Vector3()
  /** each joint's nearest shape distance at a point in the rhino's space, and the blended skin distance */
  const perJoint = new Float64Array(joints.length)
  function field(x: number, y: number, z: number, wantJoints: boolean): number {
    let d = 1
    if (wantJoints) perJoint.fill(1)
    for (let i = 0; i < shapes.length; i++) {
      const b = boxes[i]!
      if (!wantJoints && (x < b.lo.x || x > b.hi.x || y < b.lo.y || y > b.hi.y || z < b.lo.z || z > b.hi.z)) continue
      const sh = shapes[i]!
      local.set(x, y, z).applyMatrix4(toJoint[sh.bone]!)
      const e = sh.dist(local.x, local.y, local.z)
      if (sh.cut) {
        d = -smin(-d, e, sh.blend) // a smooth carve: the most of d and -e
        continue
      }
      d = i === 0 ? e : smin(d, e, sh.blend)
      if (wantJoints && e < perJoint[sh.bone]!) perJoint[sh.bone] = e
    }
    return d
  }
  const mc = new MarchingCubes(res, new MeshBasicMaterial(), false, false, 120000)
  mc.isolation = 0
  for (let k = 0; k < res; k++)
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) {
        const f = (n: number) => (n - res / 2) / (res / 2)
        mc.field[k * res * res + j * res + i] = -field(centre.x + f(i) * half.x, centre.y + f(j) * half.y, centre.z + f(k) * half.z, false)
      }
  mc.update()
  const n = mc.count
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  for (let v = 0; v < n; v++) {
    pos[v * 3] = centre.x + mc.positionArray[v * 3]! * half.x
    pos[v * 3 + 1] = centre.y + mc.positionArray[v * 3 + 1]! * half.y
    pos[v * 3 + 2] = centre.z + mc.positionArray[v * 3 + 2]! * half.z
    // the field's slope was taken in grid steps: stretch it back to the rhino's space
    const nx = mc.normalArray[v * 3]! / half.x
    const ny = mc.normalArray[v * 3 + 1]! / half.y
    const nz = mc.normalArray[v * 3 + 2]! / half.z
    const l = Math.hypot(nx, ny, nz) || 1
    nor[v * 3] = nx / l
    nor[v * 3 + 1] = ny / l
    nor[v * 3 + 2] = nz / l
  }
  mc.geometry.dispose()
  ;(mc.material as Material).dispose()
  let g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g = mergeVertices(g, 1e-5)
  // skin weights: each point follows the joints whose shapes it's nearest, softly, so the skin bends at the joins
  const p = g.getAttribute('position')
  const count = p.count
  const idx = new Uint16Array(count * 4)
  const wts = new Float32Array(count * 4)
  for (let v = 0; v < count; v++) {
    field(p.getX(v), p.getY(v), p.getZ(v), true)
    const near = Math.min(...perJoint)
    const ranked = Array.from(perJoint, (d, b) => ({ b, w: Math.exp(-(d - near) / 0.03) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, 4)
    const sum = ranked.reduce((t, r) => t + r.w, 0)
    ranked.forEach((r, k) => {
      idx[v * 4 + k] = r.b
      wts[v * 4 + k] = r.w / sum
    })
  }
  g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4))
  g.setAttribute('skinWeight', new Float32BufferAttribute(wts, 4))
  return g
}

let skinMade: BufferGeometry | null = null

/** Build the rhino in `colour` (CSS colour) */
export function buildRhino(colour: string): Rhino3d {
  const uniforms = {
    uColour: { value: new Color(colour) },
    uBaseZ: { value: 0 },
    uHeight: { value: 1 },
    uGlitch: { value: 0 },
    uBright: { value: 1 },
    uTexture: { value: 0 },
  }
  const light = new ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthFunc: LessEqualDepth, blending: AdditiveBlending })
  // the horn tip and the glint in each eye glow
  const glowUniforms = { ...uniforms, uBright: { value: 3 } }
  const glow = new ShaderMaterial({ uniforms: glowUniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthFunc: LessEqualDepth, blending: AdditiveBlending })
  // nudged a hair back: two shader programs needn't agree on depth to the last bit, and without this the light pass
  // fails against its own surface in specks
  const depth = new MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 })
  const geometries: BufferGeometry[] = []
  const materials: Material[] = [light, glow, depth]

  /** a rigid piece on a joint (horns, eyes): drawn into depth first, then as light */
  function piece(g: BufferGeometry, m: ShaderMaterial = light): Group {
    geometries.push(g)
    const holder = new Group()
    const d = new Mesh(g, depth)
    const l = new Mesh(g, m)
    d.frustumCulled = l.frustumCulled = false
    holder.add(d, l)
    return holder
  }

  // ---- the joints, resting: the body hangs from the back hips, so tipping it rears it up round them
  const group = new Group()
  const joints: Bone[] = []
  const joint = (parent: Object3D, x: number, y: number, z: number): Bone => {
    const b = new Bone()
    b.position.set(x, y, z)
    parent.add(b)
    joints.push(b)
    return b
  }
  const tipper = joint(group, LEG.back.x, 0, LEG.back.hipZ)
  const body = joint(tipper, -LEG.back.x, 0, -LEG.back.hipZ)
  const tail = joint(body, -0.41, 0, 0.74)
  tail.rotation.y = 0.35 // hangs angled back
  const legs: Array<{ hip: Bone; knee: Bone; lower: number }> = []
  for (const [y, front] of [
    [LEG.side, false],
    [-LEG.side, false],
    [LEG.side, true],
    [-LEG.side, true],
  ] as Array<[number, boolean]>) {
    const L = front ? LEG.front : LEG.back
    const hip = joint(body, L.x, y, L.hipZ)
    const knee = joint(hip, 0, 0, -L.upper)
    legs.push({ hip, knee, lower: L.lower })
  }
  const neck = joint(body, NECK.x, 0, NECK.z)
  neck.rotation.y = NECK.down
  group.updateMatrixWorld(true)

  // ---- the shapes, each on its joint, in that joint's space. The body goes first; the rest blend into it.
  const at = (b: Bone) => joints.indexOf(b)
  const plain = loftDist(BODY, 2.5)
  const shapes: Shape[] = [{ bone: at(body), dist: (x, y, z) => plain(x, y, z) - bodyFolds(x, y, z), box: loftBox(BODY), blend: 0 }]
  {
    const a: V3 = [0, 0, 0]
    const b: V3 = [0, 0, -0.34]
    shapes.push({ bone: at(tail), dist: roundCone(a, b, 0.02, 0.012), box: coneBox(a, b, 0.02), blend: 0.03 })
    shapes.push({ bone: at(tail), dist: ellipsoid([0, 0, -0.35], [0.028, 0.028, 0.045]), box: coneBox([0, 0, -0.35], [0, 0, -0.35], 0.045), blend: 0.02 })
  }
  legs.forEach((l, i) => {
    const front = i >= 2
    const L = front ? LEG.front : LEG.back
    // the thigh or shoulder mass, blending into the body; the shoulders are the heaviest part
    const c: V3 = [front ? 0.01 : -0.02, 0, 0]
    const r: V3 = front ? [0.16, 0.11, 0.21] : [0.12, 0.08, 0.13]
    shapes.push({ bone: at(l.hip), dist: ellipsoid(c, r), box: coneBox(c, c, Math.max(...r)), blend: 0.08 })
    // upper leg, tapering to the knee
    const top = front ? 0.115 : 0.095
    shapes.push({ bone: at(l.hip), dist: roundCone([0, 0, 0], [0, 0, -L.upper], top, 0.085), box: coneBox([0, 0, 0], [0, 0, -L.upper], top), blend: 0.05 })
    // lower leg: a column down to the foot
    const foot: V3 = [0.01, 0, -L.lower + 0.09]
    shapes.push({ bone: at(l.knee), dist: roundCone([0, 0, 0], foot, 0.085, 0.09), box: coneBox([0, 0, 0], foot, 0.09), blend: 0.04 })
    // the foot flares into a wide pad on the ground, with three toes round its front
    const pad: V3 = [0.015, 0, -L.lower + 0.04]
    shapes.push({ bone: at(l.knee), dist: ellipsoid(pad, [0.11, 0.1, 0.04]), box: coneBox(pad, pad, 0.11), blend: 0.04 })
    for (const a of [-0.75, 0, 0.75]) {
      const toe: V3 = [0.015 + 0.09 * Math.cos(a), 0.09 * Math.sin(a), -L.lower + 0.032]
      shapes.push({ bone: at(l.knee), dist: ellipsoid(toe, [0.036, 0.032, 0.032]), box: coneBox(toe, toe, 0.036), blend: 0.015 })
    }
  })
  shapes.push({ bone: at(neck), dist: loftDist(HEAD, 2.6), box: loftBox(HEAD), blend: 0.07 })
  for (const side of [1, -1]) {
    // a flared nostril on each side of the muzzle, with its opening cut in
    const flare: V3 = [0.56, 0.125 * side, -0.07]
    shapes.push({ bone: at(neck), dist: ellipsoid(flare, [0.068, 0.052, 0.05]), box: coneBox(flare, flare, 0.068), blend: 0.022 })
    const hole: V3 = [0.607, 0.14 * side, -0.068]
    shapes.push({ bone: at(neck), dist: ellipsoid(hole, [0.052, 0.032, 0.03]), box: coneBox(hole, hole, 0.052), blend: 0.008, cut: true })
    // a heavy brow over each eye and a lower lid under it, so the eye sits in a hollow of skin
    const brow: V3 = [0.28, 0.128 * side, 0.068]
    shapes.push({ bone: at(neck), dist: ellipsoid(brow, [0.045, 0.02, 0.016]), box: coneBox(brow, brow, 0.045), blend: 0.02 })
    const lid: V3 = [0.285, 0.126 * side, 0.016]
    shapes.push({ bone: at(neck), dist: ellipsoid(lid, [0.035, 0.016, 0.011]), box: coneBox(lid, lid, 0.035), blend: 0.015 })
    // tube ears, standing up and out, angled back
    const base: V3 = [0.02, 0.1 * side, 0.13]
    const up = new Vector3(0, 0, 0.13).applyEuler(new Euler(-0.45 * side, -0.35, 0))
    const tip: V3 = [base[0] + up.x, base[1] + up.y, base[2] + up.z]
    shapes.push({ bone: at(neck), dist: roundCone(base, tip, 0.038, 0.016), box: coneBox(base, tip, 0.04), blend: 0.025 })
  }

  // about 0.3 s on a desktop, so it's made once per page and shared (it doesn't depend on the colour)
  skinMade ??= buildSkin(shapes, joints)
  const skin = skinMade
  const skeleton = new Skeleton(joints)
  // the skin's own light, the same but wrinkled on the legs and face
  const skinLight = new ShaderMaterial({ uniforms: { ...uniforms, uTexture: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthFunc: LessEqualDepth, blending: AdditiveBlending })
  materials.push(skinLight)
  for (const m of [depth, skinLight] as Material[]) {
    const mesh = new SkinnedMesh(skin, m)
    mesh.frustumCulled = false
    group.add(mesh)
    mesh.bind(skeleton)
  }

  // ---- horns and eyes: rigid, riding on the head
  const front = piece(horn(0.34, 0.075))
  front.position.set(0.5, 0, 0.0)
  front.rotation.y = -1.25
  neck.add(front)
  const hornTip = piece(new SphereGeometry(0.014, 6, 4), glow)
  // the horn's own tip (0.34 along, 0.119 up), turned as the horn is
  hornTip.position.set(0.5 + 0.34 * Math.cos(1.25) - 0.119 * Math.sin(1.25), 0, 0.34 * Math.sin(1.25) + 0.119 * Math.cos(1.25))
  neck.add(hornTip)
  const rear = piece(horn(0.16, 0.055))
  rear.position.set(0.34, 0, 0.07)
  rear.rotation.y = -1.35
  neck.add(rear)
  // eyes: small almonds set into the side of the head between brow and lid, a little brighter than the skin, each with
  // a tiny glint, rather than glowing dots
  const eyeLight = new ShaderMaterial({ uniforms: { ...uniforms, uBright: { value: 1.7 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthFunc: LessEqualDepth, blending: AdditiveBlending })
  materials.push(eyeLight)
  for (const side of [1, -1]) {
    const eye = piece(new SphereGeometry(1, 14, 10), eyeLight)
    eye.scale.set(0.024, 0.009, 0.012)
    eye.position.set(0.285, 0.133 * side, 0.042)
    eye.rotation.set(0, 0.25, 0) // the almond slopes down towards the nose
    neck.add(eye)
    const glint = piece(new SphereGeometry(0.0045, 6, 4), glow)
    glint.position.set(0.291, 0.141 * side, 0.046)
    neck.add(glint)
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
