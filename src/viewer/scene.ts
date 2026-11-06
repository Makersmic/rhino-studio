/**
 * The three.js side of the viewer: bed, toolpath threads and camera. It draws only
 * when something changes, so an idle preview costs nothing, which matters on a
 * weak kiosk. Turning and zooming change the view and nothing else.
 *
 * Normally each move is a strip as wide as the thread really is, turned to face the
 * screen and shaded to look round. The lighter mode draws plain 1-pixel lines.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GcodeBounds } from '@/gcode/parse'
import type { DrawData } from './draw'
import { frameSeconds } from './spin'

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface ViewerColours {
  ink: Rgb
  paper: Rgb
}
export interface BedShape {
  x: number
  y: number
  keepOut: Array<{ x0: number; y0: number; x1: number; y1: number }>
  /** an extra area to keep clear: the prime line */
  prime?: { x0: number; y0: number; x1: number; y1: number } | null
}
/** A box of thin lines: the CNC stock, or where a prepared file's moves go */
export interface WireBox {
  min: [number, number, number]
  max: [number, number, number]
}
export type ViewAngle = 'angle' | 'top'

const FOV = 32
/** How strong travel moves are when shown, and how far earlier layers are dimmed */
const TRAVEL_SHOWN = 0.3
const EARLIER_LAYERS = 0.8

const LINE_VERTEX = /* glsl */ `
  attribute float shade;
  attribute vec3 tangent;
  uniform int uDimBefore;
  uniform vec2 uHeight;
  varying float vShade;
  varying float vDim;
  varying float vHeight;
  varying vec3 vTangent;
  varying vec3 vWorld;
  void main() {
    vShade = shade;
    vTangent = tangent;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vDim = gl_VertexID < uDimBefore ? 1.0 : 0.0;
    vHeight = clamp((position.z - uHeight.x) / max(uHeight.y - uHeight.x, 0.001), 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * One rectangle per move, drawn with instancing so the move data is stored once. Its width is worked out in
 * real millimetres at that distance from the camera, and never drops below the thinnest line the screen can
 * show, or threads would vanish when zoomed out.
 */
const STRIP_VERTEX = /* glsl */ `
  attribute vec2 corner;
  attribute vec3 iStart;
  attribute vec3 iEnd;
  attribute float iShade;
  attribute vec3 iTangent;
  attribute float iWidth;
  uniform int uDimBefore;
  uniform vec2 uHeight;
  uniform vec2 uResolution;
  uniform float uMinPixels;
  uniform float uTravel;
  uniform float uNear;
  varying float vShade;
  varying float vDim;
  varying float vHeight;
  varying vec3 vTangent;
  varying vec3 vWorld;
  varying float vAcross;
  varying float vPixels;
  void main() {
    vShade = iShade;
    if (iShade < 0.002 && uTravel < 0.0) {
      // Hidden travel: skip it here, cheaper than discarding its pixels
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vTangent = iTangent;
    vec3 pos = mix(iStart, iEnd, corner.x);
    vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
    vDim = gl_InstanceID < uDimBefore ? 1.0 : 0.0;
    vHeight = clamp((pos.z - uHeight.x) / max(uHeight.y - uHeight.x, 0.001), 0.0, 1.0);
    vAcross = corner.y;

    // Cut a move at the camera's near plane, or its screen direction comes out wrong when zoomed right in
    vec4 va = modelViewMatrix * vec4(iStart, 1.0);
    vec4 vb = modelViewMatrix * vec4(iEnd, 1.0);
    float limit = -uNear;
    if (va.z > limit && vb.z > limit) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    if (va.z > limit) va = mix(va, vb, (limit - va.z) / (vb.z - va.z));
    else if (vb.z > limit) vb = mix(vb, va, (limit - vb.z) / (va.z - vb.z));

    vec4 ca = projectionMatrix * va;
    vec4 cb = projectionMatrix * vb;
    vec2 pa = ca.xy / ca.w * uResolution * 0.5;
    vec2 pb = cb.xy / cb.w * uResolution * 0.5;
    vec2 d = pb - pa;
    float len = length(d);
    // A move seen end-on has no direction on screen, so any will do
    d = len > 0.0001 ? d / len : vec2(1.0, 0.0);
    vec2 n = vec2(-d.y, d.x);

    vec4 c = corner.x < 0.5 ? ca : cb;
    float pixelsPerMm = projectionMatrix[1][1] * uResolution.y * 0.5 / c.w;
    float pixels = max(iWidth * 2.55 * pixelsPerMm, uMinPixels);
    vPixels = pixels;
    // Half a width past each end, so neighbouring moves join with no notch at the corners
    float ends = pixels > uMinPixels ? pixels * 0.5 * (corner.x < 0.5 ? -1.0 : 1.0) : 0.0;
    vec2 offset = (n * corner.y * pixels * 0.5 + d * ends) * 2.0 / uResolution;
    gl_Position = vec4(c.xy + offset * c.w, c.z, c.w);
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uPaper;
  uniform float uTravel;
  uniform float uEarlier;
  uniform float uLit;
  uniform float uInkIsDark;
  uniform vec3 uLight;
  varying float vShade;
  varying float vDim;
  varying float vHeight;
  varying vec3 vTangent;
  varying vec3 vWorld;
  #ifdef STRIP
  varying float vAcross;
  varying float vPixels;
  #endif
  void main() {
    float s = vShade < 0.002 ? uTravel : vShade;
    if (s < 0.0) discard;
    if (uLit > 0.5 && vShade >= 0.002) {
      // A lit thread (Kajiya-Kay): brightest when it runs across the light, dark when it runs along it,
      // so walls and infill in different directions separate instead of merging into a grey shape.
      vec3 t = normalize(vTangent);
      float tl = dot(t, uLight);
      float across = 1.0 - tl * tl;
      vec3 v = normalize(cameraPosition - vWorld);
      float tv = dot(t, v);
      float sheen = pow(max(0.0, sqrt(across) * sqrt(max(0.0, 1.0 - tv * tv)) - tl * tv), 24.0);
      float lit = clamp(0.12 + 0.88 * across + 0.3 * sheen, 0.0, 1.0);
      #ifdef STRIP
      // Wide enough to see across: fall off towards the edges, so it reads as round rather than a flat ribbon
      float round = sqrt(max(0.0, 1.0 - vAcross * vAcross));
      lit *= mix(1.0, 0.45 + 0.55 * round, smoothstep(1.5, 5.0, vPixels));
      #endif
      // On a light page, light must make a line paler, not darker, or the lighting reads as a negative
      s *= uInkIsDark > 0.5 ? 1.0 - 0.72 * lit : 0.22 + 0.78 * lit;
    }
    // Thin lines have no surface to light, so earlier layers get fainter towards the bottom to show the shape
    if (vDim > 0.5) s *= uEarlier * mix(0.45, 1.0, vHeight);
    gl_FragColor = vec4(mix(uPaper, uInk, s), 1.0);
  }
`

function material(strip: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: strip ? STRIP_VERTEX : LINE_VERTEX,
    fragmentShader: FRAGMENT,
    defines: strip ? { STRIP: 1 } : {},
    uniforms: {
      uInk: { value: new Vector3(1, 1, 1) },
      uPaper: { value: new Vector3(0, 0, 0) },
      uTravel: { value: -1 },
      uEarlier: { value: 1 },
      uDimBefore: { value: 0 },
      uHeight: { value: new Vector2(0, 1) },
      uLit: { value: 0 },
      uInkIsDark: { value: 0 },
      // Off to the side and a little above, in machine X Y Z
      uLight: { value: new Vector3(1, -0.45, 0.35).normalize() },
      uResolution: { value: new Vector2(1, 1) },
      uMinPixels: { value: 1 },
      uNear: { value: 1 },
    },
  })
}

/**
 * The Dashboard hologram: plain lines, see-through, over the camera. Moves before uDone (the part already made) are the
 * deeper turquoise and nearly solid; the rest is a faint pale ghost. Travel isn't drawn. A soft fade towards the bottom
 * of each part keeps a dense print from turning into a flat block of colour.
 */
function hologramMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float shade;
      uniform int uDone;
      uniform int uNowFrom;
      uniform vec2 uHeight;
      varying float vShade;
      varying float vDone;
      varying float vHeight;
      void main() {
        vShade = shade;
        // 0 still to make, 1 done, 2 the layer being made now
        vDone = gl_VertexID < uDone ? (gl_VertexID >= uNowFrom ? 2.0 : 1.0) : 0.0;
        vHeight = clamp((position.z - uHeight.x) / max(uHeight.y - uHeight.x, 0.001), 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uGhost;
      uniform vec3 uDoneColour;
      varying float vShade;
      varying float vDone;
      varying float vHeight;
      void main() {
        if (vShade < 0.002) discard;
        // Faint enough that overlapping threads build up a soft volume instead of a flat block
        if (vDone > 1.5) gl_FragColor = vec4(mix(uGhost, vec3(1.0), 0.5), 1.0);
        else if (vDone > 0.5) gl_FragColor = vec4(uDoneColour, 0.7);
        else gl_FragColor = vec4(uGhost, 0.05 + 0.07 * vHeight);
      }`,
    uniforms: {
      uDone: { value: 0 },
      uNowFrom: { value: 0 },
      uHeight: { value: new Vector2(0, 1) },
      uGhost: { value: new Vector3(0.56, 0.97, 0.93) },
      uDoneColour: { value: new Vector3(0.06, 0.64, 0.6) },
    },
  })
}

/**
 * The part, solid and lit from the same side as the threads. Its normals come from the triangles themselves, on the
 * graphics card, so a big model needs no second copy of its data. Lit faces are always the brighter ones, in either theme.
 */
function modelMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      precision highp float;
      uniform vec3 uInk;
      uniform vec3 uPaper;
      uniform float uInkIsDark;
      uniform vec3 uLight;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 v = normalize(cameraPosition - vWorld);
        if (dot(n, v) < 0.0) n = -n;
        float side = 0.5 + 0.5 * dot(n, uLight);
        float top = max(0.0, n.z) * 0.18;
        float lit = clamp(side * 0.8 + top, 0.0, 1.0);
        vec3 c = uInkIsDark > 0.5 ? mix(uInk, uPaper, 0.12 + 0.7 * lit) : mix(uPaper, uInk, 0.14 + 0.78 * lit);
        gl_FragColor = vec4(c, 1.0);
      }`,
    uniforms: {
      uInk: { value: new Vector3(0, 0, 0) },
      uPaper: { value: new Vector3(1, 1, 1) },
      uInkIsDark: { value: 0 },
      uLight: { value: new Vector3(1, -0.45, 0.35).normalize() },
    },
  })
}

/**
 * The selected part's outline: the same triangles drawn in ink, spread a few pixels outward on screen and pushed back in
 * depth, so only the ring outside the real part shows. It works on a curved part with no sharp edges, needs no second
 * copy of the model, and doesn't care which way the file's triangles face.
 */
function outlineMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    vertexShader: `
      uniform vec2 uResolution;
      uniform float uPixels;
      uniform float uMid;
      void main() {
        mat4 m = projectionMatrix * viewMatrix * modelMatrix;
        vec4 c = m * vec4(position, 1.0);
        vec4 o = m * vec4(0.0, 0.0, uMid, 1.0);
        vec2 d = (c.xy / c.w - o.xy / o.w) * uResolution;
        float len = length(d);
        if (len > 0.0) c.xy += d / len * uPixels * 2.0 / uResolution * c.w;
        c.z += 0.001 * c.w;
        gl_Position = c;
      }`,
    fragmentShader: `
      precision highp float;
      uniform vec3 uInk;
      void main() { gl_FragColor = vec4(uInk, 1.0); }`,
    uniforms: {
      uInk: { value: new Vector3(0, 0, 0) },
      uPaper: { value: new Vector3(1, 1, 1) },
      uInkIsDark: { value: 0 },
      uResolution: { value: new Vector2(1, 1) },
      uPixels: { value: 2 },
      uMid: { value: 0 },
    },
  })
}

/** The twelve edges of a box, as a line list */
export function boxLines(boxes: WireBox[]): Float32Array {
  const p: number[] = []
  for (const { min: a, max: b } of boxes) {
    const c = [
      [a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]],
    ] as const
    for (let i = 0; i < 4; i++) {
      const u = c[i]!
      const w = c[(i + 1) % 4]!
      p.push(u[0], u[1], a[2], w[0], w[1], a[2], u[0], u[1], b[2], w[0], w[1], b[2], u[0], u[1], a[2], u[0], u[1], b[2])
    }
  }
  return Float32Array.from(p)
}

/** The bed outline, a 50 mm grid, the corner at X0 Y0, and the areas to keep clear */
export function bedLines(bed: BedShape): { positions: Float32Array; shades: Uint8Array } {
  const p: number[] = []
  const s: number[] = []
  const line = (x0: number, y0: number, x1: number, y1: number, strength: number) => {
    p.push(x0, y0, 0, x1, y1, 0)
    s.push(strength, strength)
  }
  for (let x = 50; x < bed.x; x += 50) line(x, 0, x, bed.y, 28)
  for (let y = 50; y < bed.y; y += 50) line(0, y, bed.x, y, 28)
  line(0, 0, bed.x, 0, 110)
  line(bed.x, 0, bed.x, bed.y, 110)
  line(bed.x, bed.y, 0, bed.y, 110)
  line(0, bed.y, 0, 0, 110)
  line(0, 0, Math.min(40, bed.x), 0, 255)
  line(0, 0, 0, Math.min(40, bed.y), 255)
  for (const k of bed.prime ? [...bed.keepOut, bed.prime] : bed.keepOut) {
    line(k.x0, k.y0, k.x1, k.y0, 90)
    line(k.x1, k.y0, k.x1, k.y1, 90)
    line(k.x1, k.y1, k.x0, k.y1, 90)
    line(k.x0, k.y1, k.x0, k.y0, 90)
    line(k.x0, k.y0, k.x1, k.y1, 60)
    line(k.x1, k.y0, k.x0, k.y1, 60)
  }
  return { positions: Float32Array.from(p), shades: Uint8Array.from(s) }
}

/** A rectangle with its four corners marked (0 or 1 along the move, -1 or 1 across it), shared by every move */
function stripShape(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry()
  g.setAttribute('corner', new BufferAttribute(Float32Array.of(0, -1, 0, 1, 1, -1, 1, 1), 2))
  // three.js needs a position attribute to count vertices; the shader doesn't use it
  g.setAttribute('position', new BufferAttribute(new Float32Array(12), 3))
  g.setIndex([0, 2, 1, 1, 2, 3])
  return g
}

export interface SceneModel {
  id: number
  vertices: Float32Array
  x: number
  y: number
  height: number
}

export class GcodeScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(FOV, 1, 1, 10000)
  private controls: OrbitControls
  private bedMaterial = material(false)
  private lineMaterial = material(false)
  private stripMaterial = material(true)
  private meshMaterial = modelMaterial()
  private wireMaterial = material(false)
  private outlineMat = outlineMaterial()
  private holoMaterial = hologramMaterial()
  private models = new Map<number, Mesh>()
  private outline: Mesh | null = null
  private wires: LineSegments | null = null
  private raycaster = new Raycaster()
  private bed: LineSegments | null = null
  private path: LineSegments | Mesh | null = null
  private strips = false
  private bounds: GcodeBounds | null = null
  private bedShape: BedShape | null = null
  private pending = 0
  private disposed = false
  private readonly requestDraw = () => this.draw()
  private readonly lost: (e: Event) => void
  private readonly restored: () => void

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { reduced: boolean; onContextChange: (lost: boolean) => void },
  ) {
    // Throws if WebGL isn't available; the component turns that into a message
    this.renderer = new WebGLRenderer({ canvas, antialias: !opts.reduced, alpha: true, powerPreference: 'default' })
    this.renderer.setClearAlpha(0)
    this.renderer.setPixelRatio(opts.reduced ? 1 : Math.min(2, window.devicePixelRatio || 1))
    this.stripMaterial.uniforms.uMinPixels!.value = this.renderer.getPixelRatio()
    this.camera.up.set(0, 0, 1)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.addEventListener('change', this.requestDraw)
    this.lost = (e) => {
      e.preventDefault()
      opts.onContextChange(true)
    }
    this.restored = () => {
      opts.onContextChange(false)
      this.draw()
    }
    canvas.addEventListener('webglcontextlost', this.lost)
    canvas.addEventListener('webglcontextrestored', this.restored)
  }

  setBed(bed: BedShape): void {
    this.bedShape = bed
    if (this.bed) {
      this.scene.remove(this.bed)
      this.bed.geometry.dispose()
    }
    const { positions, shades } = bedLines(bed)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(positions, 3))
    g.setAttribute('shade', new BufferAttribute(shades, 1, true))
    this.bed = new LineSegments(g, this.bedMaterial)
    this.bed.frustumCulled = false
    this.scene.add(this.bed)
    this.draw()
  }

  /** `strips` draws threads at their real width; otherwise plain lines */
  setPath(d: DrawData, strips: boolean): void {
    if (this.path) {
      this.scene.remove(this.path)
      this.path.geometry.dispose()
    }
    this.strips = strips
    const m = strips ? this.stripMaterial : this.lineMaterial
    m.uniforms.uLit!.value = 1
    if (d.bounds) m.uniforms.uHeight!.value.set(d.bounds.min[2], d.bounds.max[2])
    if (strips) {
      const g = stripShape()
      // The same arrays the lines use, read once per move, so strips add no copy of the data
      const ends = new InstancedInterleavedBuffer(d.segments, 6, 1)
      g.setAttribute('iStart', new InterleavedBufferAttribute(ends, 3, 0))
      g.setAttribute('iEnd', new InterleavedBufferAttribute(ends, 3, 3))
      g.setAttribute('iShade', new InterleavedBufferAttribute(new InstancedInterleavedBuffer(d.shades, 2, 1), 1, 0, true))
      g.setAttribute('iTangent', new InterleavedBufferAttribute(new InstancedInterleavedBuffer(d.tangents, 6, 1), 3, 0, true))
      // 255 = 1 after normalising, so the shader's 2.55 turns it back into millimetres
      g.setAttribute('iWidth', new InstancedBufferAttribute(d.widths, 1, true))
      g.instanceCount = d.drawnMoves
      this.path = new Mesh(g, m)
    } else {
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(d.segments, 3))
      g.setAttribute('shade', new BufferAttribute(d.shades, 1, true))
      g.setAttribute('tangent', new BufferAttribute(d.tangents, 3, true))
      this.path = new LineSegments(g, m)
    }
    // Parts of the path come and go with the sliders, so a fixed bounding sphere would be wrong
    this.path.frustumCulled = false
    this.scene.add(this.path)
    this.bounds = d.bounds
    this.setView('angle')
  }

  /** Draw moves up to `end`, with those before `dimBefore` fainter */
  setVisible(end: number, dimBefore: number): void {
    if (!this.path) return
    const m = this.strips ? this.stripMaterial : this.lineMaterial
    if (this.strips) (this.path.geometry as InstancedBufferGeometry).instanceCount = end
    else this.path.geometry.setDrawRange(0, end * 2)
    m.uniforms.uDimBefore!.value = this.strips ? dimBefore : dimBefore * 2
    m.uniforms.uEarlier!.value = dimBefore > 0 ? EARLIER_LAYERS : 1
    this.draw()
  }

  /** The hologram's toolpath: lines in the hologram's own colours, framed from the front corner */
  setHologram(d: DrawData, colours: { ghost: Rgb; done: Rgb }): void {
    if (this.path) {
      this.scene.remove(this.path)
      this.path.geometry.dispose()
    }
    this.strips = false
    const u = this.holoMaterial.uniforms
    u.uGhost!.value.set(colours.ghost.r, colours.ghost.g, colours.ghost.b)
    u.uDoneColour!.value.set(colours.done.r, colours.done.g, colours.done.b)
    if (d.bounds) u.uHeight!.value.set(d.bounds.min[2], d.bounds.max[2])
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(d.segments, 3))
    g.setAttribute('shade', new BufferAttribute(d.shades, 1, true))
    this.path = new LineSegments(g, this.holoMaterial)
    this.path.frustumCulled = false
    this.scene.add(this.path)
    this.bounds = d.bounds
    this.setView('angle')
  }

  /** The first `moves` drawn moves are done; those from `nowFrom` on are the layer being made now */
  setHologramDone(moves: number, nowFrom: number): void {
    this.holoMaterial.uniforms.uDone!.value = moves * 2
    this.holoMaterial.uniforms.uNowFrom!.value = nowFrom * 2
    this.draw()
  }

  setTravel(show: boolean): void {
    for (const m of [this.lineMaterial, this.stripMaterial]) m.uniforms.uTravel!.value = show ? TRAVEL_SHOWN : -1
    this.draw()
  }

  setColours(c: ViewerColours): void {
    for (const m of [this.bedMaterial, this.lineMaterial, this.stripMaterial, this.meshMaterial, this.wireMaterial, this.outlineMat]) {
      m.uniforms.uInk!.value.set(c.ink.r, c.ink.g, c.ink.b)
      m.uniforms.uPaper!.value.set(c.paper.r, c.paper.g, c.paper.b)
      m.uniforms.uInkIsDark!.value = c.ink.r + c.ink.g + c.ink.b < c.paper.r + c.paper.g + c.paper.b ? 1 : 0
    }
    this.draw()
  }

  /**
   * The parts as triangles (each centred on X/Y, bottom on Z 0), where they sit. Only what changed is touched, so this is
   * cheap to call on every step of a drag. It uses the arrays it's given, without a copy.
   */
  setModels(list: SceneModel[], selectedId: number | null): void {
    const wanted = new Set(list.map((m) => m.id))
    for (const [id, mesh] of this.models) {
      if (!wanted.has(id)) {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        this.models.delete(id)
      }
    }
    for (const m of list) {
      let mesh = this.models.get(m.id)
      if (mesh && (mesh.geometry.getAttribute('position') as BufferAttribute).array !== m.vertices) {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        mesh = undefined
      }
      if (!mesh) {
        const g = new BufferGeometry()
        g.setAttribute('position', new BufferAttribute(m.vertices, 3))
        g.computeBoundingSphere()
        mesh = new Mesh(g, this.meshMaterial)
        mesh.userData.partId = m.id
        this.scene.add(mesh)
        this.models.set(m.id, mesh)
      }
      mesh.position.set(m.x, m.y, 0)
    }
    this.showOutline(selectedId === null ? undefined : list.find((m) => m.id === selectedId))
    this.draw()
  }

  private showOutline(m: SceneModel | undefined): void {
    const mesh = m && this.models.get(m.id)
    if (!m || !mesh) {
      if (this.outline) this.outline.visible = false
      return
    }
    if (!this.outline) {
      this.outline = new Mesh(mesh.geometry, this.outlineMat)
      this.outline.frustumCulled = false
      this.scene.add(this.outline)
    }
    this.outline.geometry = mesh.geometry
    this.outline.position.copy(mesh.position)
    this.outline.visible = true
    this.outlineMat.uniforms.uMid!.value = m.height / 2
  }

  /** Boxes drawn in thin lines; they replace any drawn before */
  setBoxes(boxes: WireBox[]): void {
    if (this.wires) {
      this.scene.remove(this.wires)
      this.wires.geometry.dispose()
      this.wires = null
    }
    if (boxes.length) {
      const positions = boxLines(boxes)
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(positions, 3))
      g.setAttribute('shade', new BufferAttribute(new Uint8Array(positions.length / 3).fill(150), 1, true))
      this.wires = new LineSegments(g, this.wireMaterial)
      this.wires.frustumCulled = false
      this.scene.add(this.wires)
    }
    this.draw()
  }

  /** What the camera aims at when there's no toolpath */
  setFocus(bounds: GcodeBounds | null): void {
    this.bounds = bounds
  }

  /** While a part is being dragged, the camera stays put */
  setOrbit(on: boolean): void {
    this.controls.enabled = on
  }

  private spinFrame = 0
  private spinLast: number | null = null
  private readonly stopSpinOnGrab = () => this.setSpin(false)
  /**
   * Turn the camera slowly around the target, about 30 s a turn. The first touch or drag stops it for good, so the view
   * holds still for the person looking. No frames run while the page is hidden.
   */
  setSpin(on: boolean): void {
    if (this.spinFrame) cancelAnimationFrame(this.spinFrame)
    this.spinFrame = 0
    this.spinLast = null
    this.controls.autoRotate = on
    this.controls.removeEventListener('start', this.stopSpinOnGrab)
    if (!on || this.disposed) return
    this.controls.addEventListener('start', this.stopSpinOnGrab)
    const tick = (now: number) => {
      if (this.disposed || !this.controls.autoRotate) return
      const dt = frameSeconds(this.spinLast, now)
      this.spinLast = now
      if (!document.hidden && dt > 0) this.controls.update(dt)
      this.spinFrame = requestAnimationFrame(tick)
    }
    this.spinFrame = requestAnimationFrame(tick)
  }

  private aim(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect()
    this.raycaster.setFromCamera(new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera)
  }

  /** The part under the pointer, the point on it and the way its face points, or null */
  hitModel(clientX: number, clientY: number): { id: number; point: [number, number, number]; normal: [number, number, number] } | null {
    if (!this.models.size) return null
    this.aim(clientX, clientY)
    const hit = this.raycaster.intersectObjects([...this.models.values()], false)[0]
    if (!hit || !hit.face) return null
    return { id: hit.object.userData.partId as number, point: [hit.point.x, hit.point.y, hit.point.z], normal: [hit.face.normal.x, hit.face.normal.y, hit.face.normal.z] }
  }

  /** Where the pointer's line crosses a level plane at height z, or null if it doesn't */
  hitLevel(clientX: number, clientY: number, z: number): [number, number] | null {
    this.aim(clientX, clientY)
    const out = new Vector3()
    return this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -z), out) ? [out.x, out.y] : null
  }

  /** Aim at the job (or the whole bed), from the front corner or straight down */
  setView(angle: ViewAngle, whole = false): void {
    const b = whole || !this.bounds ? this.bedBox() : this.bounds
    if (!b) return
    const centre = new Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2)
    const radius = Math.max(5, new Vector3(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]).length() / 2)
    const aspect = Math.max(0.3, this.camera.aspect)
    const half = (FOV * Math.PI) / 360
    const fitHeight = radius / Math.sin(half)
    const fitWidth = radius / Math.sin(Math.atan(Math.tan(half) * aspect))
    const distance = Math.max(fitHeight, fitWidth) * 1.1
    const dir = angle === 'top' ? new Vector3(0, -0.0001, 1) : new Vector3(0.55, -1, 0.75)
    dir.normalize()
    this.camera.position.copy(centre).addScaledVector(dir, distance)
    this.camera.near = Math.max(0.5, distance / 200)
    this.camera.far = distance * 30
    this.camera.updateProjectionMatrix()
    this.stripMaterial.uniforms.uNear!.value = this.camera.near
    this.controls.target.copy(centre)
    this.controls.minDistance = radius * 0.1
    this.controls.maxDistance = distance * 8
    this.controls.update()
    this.draw()
  }

  private bedBox(): GcodeBounds | null {
    const s = this.bedShape
    return s ? { min: [0, 0, 0], max: [s.x, s.y, 0] } : null
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.getDrawingBufferSize(this.stripMaterial.uniforms.uResolution!.value)
    this.renderer.getDrawingBufferSize(this.outlineMat.uniforms.uResolution!.value)
    this.outlineMat.uniforms.uPixels!.value = 1.5 * this.renderer.getPixelRatio()
    this.draw()
  }

  /** At most one draw per screen refresh, and none while the page is hidden */
  draw(): void {
    if (this.pending || this.disposed || document.hidden) return
    this.pending = requestAnimationFrame(() => {
      this.pending = 0
      if (!this.disposed) this.renderer.render(this.scene, this.camera)
    })
  }

  dispose(): void {
    this.disposed = true
    if (this.pending) cancelAnimationFrame(this.pending)
    if (this.spinFrame) cancelAnimationFrame(this.spinFrame)
    this.controls.removeEventListener('start', this.stopSpinOnGrab)
    this.canvas.removeEventListener('webglcontextlost', this.lost)
    this.canvas.removeEventListener('webglcontextrestored', this.restored)
    this.controls.removeEventListener('change', this.requestDraw)
    this.controls.dispose()
    this.bed?.geometry.dispose()
    this.path?.geometry.dispose()
    for (const mesh of this.models.values()) mesh.geometry.dispose()
    this.wires?.geometry.dispose()
    this.outlineMat.dispose()
    this.holoMaterial.dispose()
    this.meshMaterial.dispose()
    this.wireMaterial.dispose()
    this.bedMaterial.dispose()
    this.lineMaterial.dispose()
    this.stripMaterial.dispose()
    this.renderer.dispose()
  }
}
