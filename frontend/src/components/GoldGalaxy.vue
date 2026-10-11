<template>
  <div ref="ctnDom" class="galaxy-container" aria-hidden="true"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl'

const props = defineProps({
  focal: { type: Array, default: () => [0.5, 0.5] },
  rotation: { type: Array, default: () => [1.0, 0.0] },
  starSpeed: { type: Number, default: 0.5 },
  density: { type: Number, default: 1 },
  hueShift: { type: Number, default: 0 },
  disableAnimation: { type: Boolean, default: false },
  speed: { type: Number, default: 1.0 },
  mouseInteraction: { type: Boolean, default: true },
  glowIntensity: { type: Number, default: 0.3 },
  saturation: { type: Number, default: 0.85 },
  mouseRepulsion: { type: Boolean, default: true },
  repulsionStrength: { type: Number, default: 2 },
  twinkleIntensity: { type: Number, default: 0.3 },
  rotationSpeed: { type: Number, default: 0.1 },
  autoCenterRepulsion: { type: Number, default: 0 },
  transparent: { type: Boolean, default: true },
  lightMode: { type: Boolean, default: false }
})

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;
uniform float uLightMode;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

// 金色调色板：深琥珀 -> 正金 -> 香槟金 -> 暖白
vec3 goldTone(float t) {
  t = fract(t);
  vec3 c0 = vec3(1.00, 0.55, 0.10);
  vec3 c1 = vec3(1.00, 0.76, 0.26);
  vec3 c2 = vec3(1.00, 0.90, 0.58);
  vec3 c3 = vec3(1.00, 0.97, 0.86);
  if (t < 0.34) return mix(c0, c1, t / 0.34);
  if (t < 0.67) return mix(c1, c2, (t - 0.34) / 0.33);
  return mix(c2, c3, (t - 0.67) / 0.33);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + offset;
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      // 金色：每颗星在金色区间内取一档（uHueShift 在金色区间内平移分布）
      float tone = fract(seed * 7.31 + uHueShift / 360.0);
      vec3 base = goldTone(tone);
      float val = max(max(base.r, base.g), base.b);
      // uSaturation 控制金色浓度：0 = 近白，1 = 满金
      base = mix(vec3(val), base, clamp(uSaturation, 0.0, 1.0));

      vec2 pad = vec2(
        tris(seed * 34.0 + uTime * uSpeed / 10.0),
        tris(seed * 38.0 + uTime * uSpeed / 30.0)
      ) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base;

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;

      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  vec2 mouseNorm = uMouse - vec2(0.5);

  if (uAutoCenterRepulsion > 0.0) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uLightMode > 0.5) {
    float energy = max(max(col.r, col.g), col.b);
    float coverage = clamp(smoothstep(0.0, 0.42, energy) * 0.92, 0.0, 0.92);
    vec3 ink = clamp(col * 0.48, 0.0, 0.82);
    gl_FragColor = vec4(mix(vec3(1.0), ink, coverage), 1.0);
  } else if (uTransparent) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(col, alpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`

const ctnDom = ref(null)
let dispose = null

onMounted(() => {
  const ctn = ctnDom.value
  if (!ctn) return

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  const disableAnimation = props.disableAnimation || reducedMotion

  const renderer = new Renderer({ alpha: props.transparent, premultipliedAlpha: false })
  const gl = renderer.gl

  if (props.lightMode) {
    gl.clearColor(1, 1, 1, 1)
  } else if (props.transparent) {
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
  } else {
    gl.clearColor(0, 0, 0, 1)
  }

  const targetMousePos = { x: 0.5, y: 0.5 }
  const smoothMousePos = { x: 0.5, y: 0.5 }
  let targetMouseActive = 0
  let smoothMouseActive = 0

  let program = null
  let cachedRect = null

  function resize() {
    const w = ctn.clientWidth || window.innerWidth
    const h = ctn.clientHeight || window.innerHeight
    if (!w || !h) return
    cachedRect = ctn.getBoundingClientRect()
    renderer.setSize(w, h)
    if (program) {
      program.uniforms.uResolution.value = new Color(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / gl.canvas.height
      )
    }
  }
  window.addEventListener('resize', resize, false)
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(ctn)
  resize()

  const geometry = new Triangle(gl)
  program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: {
        value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height)
      },
      uFocal: { value: new Float32Array(props.focal) },
      uRotation: { value: new Float32Array(props.rotation) },
      uStarSpeed: { value: props.starSpeed },
      uDensity: { value: props.density },
      uHueShift: { value: props.hueShift },
      uSpeed: { value: props.speed },
      uMouse: { value: new Float32Array([smoothMousePos.x, smoothMousePos.y]) },
      uGlowIntensity: { value: props.glowIntensity },
      uSaturation: { value: props.saturation },
      uMouseRepulsion: { value: props.mouseRepulsion },
      uTwinkleIntensity: { value: props.twinkleIntensity },
      uRotationSpeed: { value: props.rotationSpeed },
      uRepulsionStrength: { value: props.repulsionStrength },
      uMouseActiveFactor: { value: 0.0 },
      uAutoCenterRepulsion: { value: props.autoCenterRepulsion },
      uTransparent: { value: props.transparent },
      uLightMode: { value: props.lightMode ? 1 : 0 }
    }
  })

  const mesh = new Mesh(gl, { geometry, program })
  let animateId = 0
  let lastTime = 0

  function update(t) {
    animateId = requestAnimationFrame(update)
    if (!disableAnimation) {
      program.uniforms.uTime.value = t * 0.001
      program.uniforms.uStarSpeed.value = (t * 0.001 * props.starSpeed) / 10.0
    }

    // 帧率无关的指数平滑：timeConstant 越小跟随越快
    const dt = lastTime ? Math.min((t - lastTime) / 1000, 0.05) : 1 / 60
    lastTime = t
    const posK = 1 - Math.exp(-dt / 0.035)
    const activeK = 1 - Math.exp(-dt / 0.06)

    smoothMousePos.x += (targetMousePos.x - smoothMousePos.x) * posK
    smoothMousePos.y += (targetMousePos.y - smoothMousePos.y) * posK
    smoothMouseActive += (targetMouseActive - smoothMouseActive) * activeK

    program.uniforms.uMouse.value[0] = smoothMousePos.x
    program.uniforms.uMouse.value[1] = smoothMousePos.y
    program.uniforms.uMouseActiveFactor.value = smoothMouseActive

    renderer.render({ scene: mesh })
  }
  animateId = requestAnimationFrame(update)
  ctn.appendChild(gl.canvas)

  function handleMouseMove(e) {
    const rect = cachedRect || ctn.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    targetMousePos.x = (e.clientX - rect.left) / rect.width
    targetMousePos.y = 1.0 - (e.clientY - rect.top) / rect.height
    targetMouseActive = 1.0
  }

  // mouseout 会从任意子元素冒泡，只有真正离开窗口时才重置
  function handleMouseLeave(e) {
    if (!e.relatedTarget) targetMouseActive = 0.0
  }

  if (props.mouseInteraction) {
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mouseout', handleMouseLeave)
  }

  dispose = () => {
    cancelAnimationFrame(animateId)
    window.removeEventListener('resize', resize)
    resizeObserver.disconnect()
    if (props.mouseInteraction) {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseout', handleMouseLeave)
    }
    if (gl.canvas.parentNode === ctn) ctn.removeChild(gl.canvas)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
})

onBeforeUnmount(() => {
  dispose?.()
  dispose = null
})
</script>

<style scoped>
.galaxy-container {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.galaxy-container :deep(canvas) {
  display: block;
}
</style>