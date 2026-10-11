<template>
  <span ref="fxRef" class="specular-outline" aria-hidden="true"></span>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Renderer, Program, Mesh, Triangle, Color } from 'ogl'

const props = defineProps({
  // SVG path 的 d，路径坐标系为 0..viewWidth / 0..viewHeight
  path: { type: String, required: true },
  viewWidth: { type: Number, default: 260 },
  viewHeight: { type: Number, default: 380 },
  samples: { type: Number, default: 96 },
  pad: { type: Number, default: 24 },
  radius: { type: Number, default: 0 },
  lineColor: { type: String, default: '#ffffff' },
  baseColor: { type: String, default: '#6E8C84' },
  intensity: { type: Number, default: 1 },
  shineSize: { type: Number, default: 14 },
  shineFade: { type: Number, default: 46 },
  thickness: { type: Number, default: 1.2 },
  baseWidth: { type: Number, default: 1.2 },
  speed: { type: Number, default: 0.22 },
  followMouse: { type: Boolean, default: true },
  proximity: { type: Number, default: 240 },
  autoAnimate: { type: Boolean, default: false },
  maxScale: { type: Number, default: 1.5 }
})

const N = 96

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform vec2  uPoints[${N}];
uniform float uPx;
uniform float uPad;
uniform vec2  uSize;
uniform float uAngle;
uniform vec3  uLineColor;
uniform vec3  uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

vec2 gClosest;

float sdPoly(vec2 p) {
  float best = 1e9;
  gClosest = uPoints[0];
  for (int i = 0; i < ${N}; i++) {
    int j = i + 1;
    if (j >= ${N}) j = 0;
    vec2 a = uPoints[i];
    vec2 b = uPoints[j];
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    vec2 q = a + ba * h;
    float d = length(p - q);
    if (d < best) {
      best = d;
      gClosest = q;
    }
  }
  return best;
}

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 s = vec2(gl_FragCoord.x / uPx - uPad, uSize.y - (gl_FragCoord.y / uPx - uPad));

  float d = sdPoly(s);
  vec2 n = normalize(s - gClosest + 1e-6);
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  float base = (1.0 - smoothstep(0.0, uBaseWidth, d)) * 0.45;
  float phi = acos(clamp(abs(dot(n, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float hi = line * rim * uIntensity;

  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`

const fxRef = ref(null)
let cleanup = null

// 用浏览器自带的路径采样把 SVG path 展平成等弧长折线
function samplePath(d, vw, vh, count) {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`)
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.cssText = 'position:absolute;left:-9999px;top:0;overflow:hidden;pointer-events:none'
  const p = document.createElementNS(NS, 'path')
  p.setAttribute('d', d)
  svg.appendChild(p)
  document.body.appendChild(svg)

  const total = p.getTotalLength()
  const out = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const pt = p.getPointAtLength((total * i) / count)
    out[i * 2] = pt.x
    out[i * 2 + 1] = pt.y
  }
  document.body.removeChild(svg)
  return out
}

onMounted(() => {
  const fx = fxRef.value
  const host = fx?.parentElement
  if (!fx || !host) return

  const w = props.viewWidth
  const h = props.viewHeight
  const pad = props.pad

  const scale = Math.min(window.devicePixelRatio || 1, props.maxScale)
  const renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: false, dpr: scale })
  const gl = renderer.gl
  gl.clearColor(0, 0, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  const geometry = new Triangle(gl)
  if (geometry.attributes.uv) delete geometry.attributes.uv

  const program = new Program(gl, {
    vertex: VERT,
    fragment: FRAG,
    uniforms: {
      uPoints: { value: samplePath(props.path, w, h, N) },
      uPx: { value: scale },
      uPad: { value: pad },
      uSize: { value: [w, h] },
      uAngle: { value: 2.4 },
      uLineColor: { value: [1, 1, 1] },
      uBaseColor: { value: [0.32, 0.32, 0.32] },
      uIntensity: { value: 1 },
      uShineSize: { value: 0.17 },
      uShineFade: { value: 0.7 },
      uThickness: { value: 1.2 },
      uBaseWidth: { value: 1.2 }
    }
  })

  const mesh = new Mesh(gl, { geometry, program })
  fx.appendChild(gl.canvas)

  const resize = () => {
    renderer.setSize(w + pad * 2, h + pad * 2)
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(host)

  let pointerAngle = null
  let proximityT = 0
  const onPointerMove = e => {
    const rect = host.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right)
    const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom)
    const dist = Math.hypot(dx, dy)
    if (dist === 0) {
      const nx = (e.clientX - cx) / (rect.width / 2)
      const ny = (cy - e.clientY) / (rect.height / 2)
      pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15
    } else {
      pointerAngle = Math.atan2(cy - e.clientY, e.clientX - cx)
    }
    const t = Math.max(0, 1 - dist / Math.max(props.proximity, 1))
    proximityT = t * t * (3 - 2 * t)
  }
  window.addEventListener('pointermove', onPointerMove)

  let angle = 2.4
  let idleAngle = 2.4
  let bright = 0
  let last = performance.now()
  let raf = 0
  let hidden = document.hidden
  const onVisibility = () => { hidden = document.hidden }
  document.addEventListener('visibilitychange', onVisibility)

  const lineC = new Color()
  const baseC = new Color()

  const update = now => {
    raf = requestAnimationFrame(update)
    if (hidden) { last = now; return }
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    idleAngle += props.speed * dt
    const steer = props.followMouse && pointerAngle != null && (!props.autoAnimate || proximityT > 0)
    const target = steer ? pointerAngle : idleAngle
    const diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    angle += diff * (1 - Math.exp(-dt * 7))

    const brightTarget = props.autoAnimate ? 1 : proximityT
    bright += (brightTarget - bright) * (1 - Math.exp(-dt * 8))

    lineC.set(props.lineColor)
    baseC.set(props.baseColor)
    program.uniforms.uAngle.value = angle
    program.uniforms.uLineColor.value = [lineC.r, lineC.g, lineC.b]
    program.uniforms.uBaseColor.value = [baseC.r, baseC.g, baseC.b]
    program.uniforms.uIntensity.value = props.intensity * bright
    program.uniforms.uShineSize.value = (props.shineSize * Math.PI) / 180
    program.uniforms.uShineFade.value = (props.shineFade * Math.PI) / 180
    program.uniforms.uThickness.value = props.thickness * scale
    program.uniforms.uBaseWidth.value = props.baseWidth * scale
    renderer.render({ scene: mesh })
  }
  raf = requestAnimationFrame(update)

  cleanup = () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('visibilitychange', onVisibility)
    if (gl.canvas.parentNode === fx) fx.removeChild(gl.canvas)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    cleanup = null
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<style scoped>
/* 画布比宿主大一圈，让轮廓辉光能溢出到容器外侧 */
.specular-outline {
  position: absolute;
  inset: -24px;
  pointer-events: none;
  z-index: 20;
}

.specular-outline :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>