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
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GcodeBounds } from '@/gcode/parse'
import type { DrawData } from './draw'

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
  for (const k of bed.keepOut) {
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

export class GcodeScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(FOV, 1, 1, 10000)
  private controls: OrbitControls
  private bedMaterial = material(false)
  private lineMaterial = material(false)
  private stripMaterial = material(true)
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

  setTravel(show: boolean): void {
    for (const m of [this.lineMaterial, this.stripMaterial]) m.uniforms.uTravel!.value = show ? TRAVEL_SHOWN : -1
    this.draw()
  }

  setColours(c: ViewerColours): void {
    for (const m of [this.bedMaterial, this.lineMaterial, this.stripMaterial]) {
      m.uniforms.uInk!.value.set(c.ink.r, c.ink.g, c.ink.b)
      m.uniforms.uPaper!.value.set(c.paper.r, c.paper.g, c.paper.b)
      m.uniforms.uInkIsDark!.value = c.ink.r + c.ink.g + c.ink.b < c.paper.r + c.paper.g + c.paper.b ? 1 : 0
    }
    this.draw()
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
    this.canvas.removeEventListener('webglcontextlost', this.lost)
    this.canvas.removeEventListener('webglcontextrestored', this.restored)
    this.controls.removeEventListener('change', this.requestDraw)
    this.controls.dispose()
    this.bed?.geometry.dispose()
    this.path?.geometry.dispose()
    this.bedMaterial.dispose()
    this.lineMaterial.dispose()
    this.stripMaterial.dispose()
    this.renderer.dispose()
  }
}
