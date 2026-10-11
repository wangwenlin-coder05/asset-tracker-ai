<template>
  <div
    ref="containerRef"
    class="glass-surface"
    :class="svgSupported ? 'glass-surface--svg' : 'glass-surface--fallback'"
    :style="containerStyle"
  >
    <svg class="glass-surface__filter" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter :id="filterId" colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
          <feImage ref="feImageRef" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

          <feDisplacementMap ref="redChannelRef" in="SourceGraphic" in2="map" result="dispRed" />
          <feColorMatrix
            in="dispRed"
            type="matrix"
            values="1 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="red"
          />

          <feDisplacementMap ref="greenChannelRef" in="SourceGraphic" in2="map" result="dispGreen" />
          <feColorMatrix
            in="dispGreen"
            type="matrix"
            values="0 0 0 0 0
                    0 1 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="green"
          />

          <feDisplacementMap ref="blueChannelRef" in="SourceGraphic" in2="map" result="dispBlue" />
          <feColorMatrix
            in="dispBlue"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 1 0 0
                    0 0 0 1 0"
            result="blue"
          />

          <feBlend in="red" in2="green" mode="screen" result="rg" />
          <feBlend in="rg" in2="blue" mode="screen" result="output" />
          <feGaussianBlur ref="gaussianBlurRef" in="output" :stdDeviation="displace" />
        </filter>
      </defs>
    </svg>

    <div class="glass-surface__content">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, useId } from 'vue'

const props = defineProps({
  width: { type: [Number, String], default: '100%' },
  height: { type: [Number, String], default: '100%' },
  borderRadius: { type: Number, default: 20 },
  borderWidth: { type: Number, default: 0.07 },
  brightness: { type: Number, default: 50 },
  glassOpacity: { type: Number, default: 0.93 },
  blur: { type: Number, default: 11 },
  displace: { type: Number, default: 0 },
  backgroundOpacity: { type: Number, default: 0 },
  saturation: { type: Number, default: 1 },
  distortionScale: { type: Number, default: -180 },
  redOffset: { type: Number, default: 0 },
  greenOffset: { type: Number, default: 10 },
  blueOffset: { type: Number, default: 20 },
  xChannel: { type: String, default: 'R' },
  yChannel: { type: String, default: 'G' },
  mixBlendMode: { type: String, default: 'difference' }
})

const uid = useId().replace(/:/g, '-')
const filterId = `glass-filter-${uid}`
const redGradId = `red-grad-${uid}`
const blueGradId = `blue-grad-${uid}`

const containerRef = ref(null)
const feImageRef = ref(null)
const redChannelRef = ref(null)
const greenChannelRef = ref(null)
const blueChannelRef = ref(null)
const gaussianBlurRef = ref(null)

const svgSupported = ref(false)

const containerStyle = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
  borderRadius: `${props.borderRadius}px`,
  '--glass-frost': props.backgroundOpacity,
  '--glass-saturation': props.saturation,
  '--filter-id': `url(#${filterId})`
}))

function generateDisplacementMap() {
  const rect = containerRef.value?.getBoundingClientRect()
  const actualWidth = rect?.width || 400
  const actualHeight = rect?.height || 200
  const edgeSize = Math.min(actualWidth, actualHeight) * (props.borderWidth * 0.5)

  const svgContent = `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${props.borderRadius}" fill="url(#${redGradId})" />
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${props.borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${props.mixBlendMode}" />
        <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${props.borderRadius}" fill="hsl(0 0% ${props.brightness}% / ${props.glassOpacity})" style="filter:blur(${props.blur}px)" />
      </svg>
    `

  return `data:image/svg+xml,${encodeURIComponent(svgContent)}`
}

function updateDisplacementMap() {
  feImageRef.value?.setAttribute('href', generateDisplacementMap())
}

function syncChannels() {
  const pairs = [
    { ref: redChannelRef, offset: props.redOffset },
    { ref: greenChannelRef, offset: props.greenOffset },
    { ref: blueChannelRef, offset: props.blueOffset }
  ]
  pairs.forEach(({ ref: r, offset }) => {
    if (r.value) {
      r.value.setAttribute('scale', (props.distortionScale + offset).toString())
      r.value.setAttribute('xChannelSelector', props.xChannel)
      r.value.setAttribute('yChannelSelector', props.yChannel)
    }
  })
}

function supportsSVGFilters() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
  const isFirefox = /Firefox/.test(navigator.userAgent)
  if (isWebkit || isFirefox) return false
  const div = document.createElement('div')
  div.style.backdropFilter = `url(#${filterId})`
  return div.style.backdropFilter !== ''
}

let ro = null

onMounted(() => {
  svgSupported.value = supportsSVGFilters()
  syncChannels()
  setTimeout(updateDisplacementMap, 0)

  ro = new ResizeObserver(() => setTimeout(updateDisplacementMap, 0))
  if (containerRef.value) ro.observe(containerRef.value)
})

onBeforeUnmount(() => ro?.disconnect())

watch(
  () => [
    props.borderRadius, props.borderWidth, props.brightness, props.glassOpacity,
    props.blur, props.displace, props.distortionScale,
    props.redOffset, props.greenOffset, props.blueOffset, props.xChannel, props.yChannel,
    props.mixBlendMode
  ],
  () => {
    syncChannels()
    updateDisplacementMap()
  }
)
</script>

<style scoped>
.glass-surface {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: opacity 0.26s ease-out;
}

.glass-surface__filter {
  width: 100%;
  height: 100%;
  pointer-events: none;
  position: absolute;
  inset: 0;
  opacity: 0;
  z-index: -1;
}

.glass-surface__content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  position: relative;
  z-index: 1;
}

.glass-surface--svg {
  background: hsl(0 0% 100% / var(--glass-frost, 0));
  backdrop-filter: var(--filter-id, url(#glass-filter)) saturate(var(--glass-saturation, 1));
  -webkit-backdrop-filter: var(--filter-id, url(#glass-filter)) saturate(var(--glass-saturation, 1));
  box-shadow:
    0 0 2px 1px rgba(255, 255, 255, 0.35) inset,
    0 0 10px 4px rgba(255, 255, 255, 0.15) inset,
    0px 4px 16px rgba(17, 17, 26, 0.05),
    0px 8px 24px rgba(17, 17, 26, 0.05),
    0px 16px 56px rgba(17, 17, 26, 0.05);
}

.glass-surface--fallback {
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(12px) saturate(1.8) brightness(1.1);
  -webkit-backdrop-filter: blur(12px) saturate(1.8) brightness(1.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 8px 32px 0 rgba(31, 38, 135, 0.2),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.4),
    inset 0 -1px 0 0 rgba(255, 255, 255, 0.2);
}
</style>