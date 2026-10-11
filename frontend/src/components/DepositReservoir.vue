<template>
  <div class="reservoir-wrapper particle-theme">
    <!-- 星空背景 -->
    <div class="starfield-bg">
      <!-- 银河带 -->
      <div class="galaxy-band"></div>
      <div class="galaxy-core"></div>

      <!-- 缓慢旋转的星空层 -->
      <div class="star-rotator">
        <div class="stars-layer stars-far">
          <span v-for="n in 96" :key="'sf-' + n" class="star" :style="getFarStarStyle(n)"></span>
        </div>
        <div class="stars-layer stars-dust">
          <span v-for="n in 72" :key="'sd-' + n" class="star" :style="getDustStarStyle(n)"></span>
        </div>
        <div class="stars-layer stars-near">
          <span v-for="n in 44" :key="'sn-' + n" class="star" :style="getNearStarStyle(n)"></span>
        </div>
      </div>

      <div class="nebula nebula-1"></div>
      <div class="nebula nebula-2"></div>
      <div class="nebula nebula-3"></div>

      <!-- 流星 -->
      <div class="meteor-layer">
        <span v-for="n in 10" :key="'mt-' + n" class="meteor" :style="getMeteorStyle(n)"></span>
      </div>
    </div>

    <!-- 主容器 -->
    <div class="reservoir-container">
      <!-- 左侧信息面板 -->
      <div class="reservoir-info">
        <div class="info-header">
          <div class="info-icon">
            <Waves class="w-5 h-5" />
            <div class="icon-ripple"></div>
            <div class="icon-ripple icon-ripple-2"></div>
          </div>
          <div class="header-text">
            <span class="info-title">资金蓄水池</span>
            <span class="info-subtitle">星河为证 · 点滴汇聚</span>
          </div>
        </div>

        <div class="info-amount">
          <span class="amount-label">当前存款总额</span>
          <div class="amount-value">
            <span class="amount-currency">¥</span>
            <span class="amount-number" ref="amountRef">{{ displayAmount }}</span>
          </div>
          <div class="amount-trend" v-if="amountChange !== 0">
            <TrendingUp v-if="amountChange > 0" class="w-3.5 h-3.5" />
            <TrendingDown v-else class="w-3.5 h-3.5" />
            <span>{{ amountChange > 0 ? '+' : '' }}¥{{ formatNumber(Math.abs(amountChange)) }}</span>
          </div>
        </div>

        <div class="info-capacity">
          <div class="capacity-header">
            <div class="capacity-title-row">
              <span class="capacity-label">蓄水池容量</span>
              <button class="capacity-edit-btn" @click="showCapacityDialog = true" title="设置容量">
                <Settings class="w-3.5 h-3.5" />
              </button>
            </div>
            <span class="capacity-amount">¥{{ formatNumber(capacity) }}</span>
          </div>

          <div class="capacity-bar-wrapper">
            <div class="capacity-bar">
              <div class="capacity-bar-bg"></div>
              <div class="capacity-bar-fill" :style="{ width: fillPercent + '%' }">
                <div class="bar-fill-inner"></div>
                <div class="bar-fill-shine"></div>
              </div>
              <div class="capacity-bar-marks">
                <span v-for="i in 5" :key="'mark-' + i" class="bar-mark" :style="{ left: (i * 20) + '%' }"></span>
              </div>
            </div>
            <div class="capacity-labels">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          <div class="capacity-stats">
            <div class="cap-stat main">
              <span class="cap-stat-value" :class="['percent-' + percentLevel]">{{ fillPercent.toFixed(1) }}%</span>
              <span class="cap-stat-label">已填充</span>
            </div>
            <div class="cap-stat-divider"></div>
            <div class="cap-stat">
              <span class="cap-stat-value small">¥{{ formatNumber(Math.max(0, capacity - currentAmount)) }}</span>
              <span class="cap-stat-label">剩余空间</span>
            </div>
            <div class="cap-stat-divider"></div>
            <div class="cap-stat">
              <span class="cap-stat-value small">{{ depositCount }}</span>
              <span class="cap-stat-label">存款项数</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 粒子蓄水池 3D 容器 -->
      <div class="reservoir-3d-wrapper">
        <!-- 隐藏路径定义：供 Canvas 精确采样瓶身轮廓 -->
        <svg class="bottle-path-defs" width="0" height="0" aria-hidden="true">
          <path ref="glassPathRef" :d="glassPath" />
        </svg>

        <div class="reservoir-3d-scene">
          <!-- 外层光晕 -->
          <div class="outer-glow"></div>

          <!-- 环绕浮游星尘 -->
          <div class="ambient-stars">
            <span
              v-for="n in 26"
              :key="'as-' + n"
              class="ambient-star"
              :style="getAmbientStarStyle(n)"
            ></span>
          </div>

          <!-- 旋转的粒子水瓶 -->
          <div class="bottle-stage">
            <div class="bottle-motion">
            <!-- 瓶身反向遮罩：后层魂环里正对着瓶身的部分被遮住，只留两侧边缘透出 -->
            <svg class="soul-mask-defs" width="0" height="0" aria-hidden="true">
              <defs>
                <mask id="soulBackMask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="1018" height="1016">
                  <rect width="1018" height="1016" fill="white"/>
                  <path :d="glassPath" :transform="`translate(${BOTTLE_STAGE_LEFT + 350} ${BOTTLE_STAGE_TOP + 300})`" fill="black" stroke="black" stroke-width="4"/>
                  <rect x="480" y="298" width="58" height="36" rx="10" fill="black"/>
                  <rect x="483" y="356" width="52" height="11" rx="6" fill="black"/>
                </mask>
              </defs>
            </svg>

            <!-- 召唤魂环：按设置的数量一个接一个出生，等间距往上套
                 后层（瓶后，被瓶身轮廓遮掉中间）+ 前层（瓶前，完整近半环） -->
            <div class="soul-rings soul-rings-back">
              <span
                v-for="ring in soulRingConfigs"
                :key="'back-' + ring.key"
                class="soul-ring"
                :style="{ animationDuration: ring.cycle + 's', animationDelay: ring.delay + 's' }"
              >
                <div class="soul-half">
                <svg class="chain-svg" viewBox="-200 -200 400 400"
                  :style="{ animationDuration: ring.cycle + 's', animationDelay: ring.delay + 's' }">
                  <g class="chain-dust">
                    <circle v-for="(band, i) in ring.bands" :key="'bd-' + i" fill="none"
                      :r="band.r" :stroke="ring.color" :stroke-width="band.w"
                      :stroke-dasharray="band.dash" :stroke-dashoffset="band.offset" :opacity="band.o"/>
                  </g>
                  <g class="chain-stars">
                    <template v-for="(n, i) in ring.nodes" :key="'bn-' + i">
                      <path class="chain-star-halo" :d="n.d" :fill="ring.color"
                        :transform="`translate(${n.x} ${n.y}) rotate(${n.rot}) scale(${n.hs})`"/>
                      <path class="chain-star" :d="n.d" fill="#ffffff"
                        :transform="`translate(${n.x} ${n.y}) rotate(${n.rot}) scale(${n.s})`"/>
                    </template>
                  </g>
                </svg>
                <b class="soul-chain" :style="{ animationDuration: ring.cycle + 's', animationDelay: ring.delay + 's' }">
                  <i v-for="s in ring.sparks" :key="'bk-' + s" class="soul-spark-slot"
                    :style="getSparkSlotStyle(ring, s)">
                    <span class="soul-tear" :style="getTearStyle(ring, s)"></span>
                  </i>
                </b>
                </div>
              </span>
            </div>

            <div class="soul-rings soul-rings-front">
              <span
                v-for="ring in soulRingConfigs"
                :key="'front-' + ring.key"
                class="soul-ring"
                :style="{ animationDuration: ring.cycle + 's', animationDelay: ring.delay + 's' }"
                @animationstart="onRingBirth(ring, $event)"
                @animationiteration="onRingBirth(ring, $event)"
              >
                <div class="soul-half">
                <svg class="chain-svg" viewBox="-200 -200 400 400"
                  :style="{ animationDuration: ring.cycle + 's', animationDelay: ring.delay + 's' }">
                  <g class="chain-dust">
                    <circle v-for="(band, i) in ring.bands" :key="'fd-' + i" fill="none"
                      :r="band.r" :stroke="ring.color" :stroke-width="band.w"
                      :stroke-dasharray="band.dash" :stroke-dashoffset="band.offset" :opacity="band.o"/>
                  </g>
                  <g class="chain-stars">
                    <template v-for="(n, i) in ring.nodes" :key="'fn-' + i">
                      <path class="chain-star-halo" :d="n.d" :fill="ring.color"
                        :transform="`translate(${n.x} ${n.y}) rotate(${n.rot}) scale(${n.hs})`"/>
                      <path class="chain-star" :d="n.d" fill="#ffffff"
                        :transform="`translate(${n.x} ${n.y}) rotate(${n.rot}) scale(${n.s})`"/>
                    </template>
                  </g>
                </svg>
                <b class="soul-chain" :style="{ animationDuration: ring.cycle + 's', animationDelay: ring.delay + 's' }">
                  <i v-for="s in ring.sparks" :key="'fk-' + s" class="soul-spark-slot"
                    :style="getSparkSlotStyle(ring, s)">
                    <span class="soul-tear" :style="getTearStyle(ring, s)"></span>
                  </i>
                </b>
                </div>
              </span>
            </div>

            <div class="bottle-anchor">
              <div class="particle-bottle">
                <!-- 瓶身轮廓外发光 -->
                <div class="glass-rim-glow" :style="{ clipPath: glassClip }"></div>

                <!-- 瓶身基础体：体积渐变 + 棱面 + 内阴影 -->
                <div class="bottle-glass" :style="{ clipPath: glassClip }">
                  <div class="glass-volume"></div>
                  <div class="glass-facets"></div>
                  <div class="glass-shoulder-shadow"></div>
                  <div class="glass-floor-shadow"></div>
                </div>

                <!-- 水体层 -->
                <div class="water-3d" :style="{ clipPath: glassClip }">
                  <div class="water-body" :style="{ top: waterTopPx + 'px' }">
                    <div class="water-depth"></div>
                    <div class="water-caustics"></div>
                  </div>
                  <div class="water-sheen" :style="{ top: waterTopPx + 'px' }"></div>
                  <div class="water-surface" :style="{ top: waterTopPx + 'px' }">
                    <div class="surface-ellipse"></div>
                    <div class="surface-line"></div>
                  </div>
                </div>

                <!-- 玻璃光泽层：高光 + 精确轮廓描边 -->
                <div class="glass-finish">
                  <div class="glass-specular glass-specular-left"></div>
                  <div class="glass-specular glass-specular-right"></div>
                  <svg
                    class="glass-rim-svg"
                    :viewBox="`0 0 ${BOTTLE_W} ${BOTTLE_H}`"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="reservoirRimGrad" x1="0" y1="0" x2="0.4" y2="1">
                        <stop offset="0%" stop-color="#eaf5ff" stop-opacity="0.9" />
                        <stop offset="42%" stop-color="#9cc9ff" stop-opacity="0.5" />
                        <stop offset="100%" stop-color="#5f9dff" stop-opacity="0.72" />
                      </linearGradient>
                    </defs>
                    <path :d="glassPath" fill="none" stroke="rgba(110, 180, 255, 0.32)" stroke-width="5" />
                    <path :d="glassPath" fill="none" stroke="url(#reservoirRimGrad)" stroke-width="1.3" />
                  </svg>
                </div>

                <!-- Canvas 粒子层 -->
                <canvas ref="particleCanvas" class="particle-canvas"></canvas>

                <!-- 漂浮装饰：星星、心形、方块 -->
                <div class="float-decorations">
                  <span
                    v-for="dec in decorations"
                    :key="dec.id"
                    class="deco-item"
                    :class="['deco-' + dec.type]"
                    :style="dec.style"
                  >
                    <template v-if="dec.type === 'star'">★</template>
                    <template v-else-if="dec.type === 'heart'">♥</template>
                    <template v-else-if="dec.type === 'diamond'">◆</template>
                    <template v-else>◈</template>
                  </span>
                </div>

                <!-- 瓶颈鎏金环 -->
                <div class="neck-band">
                  <div class="band-body"></div>
                  <div class="band-shine"></div>
                </div>

                <!-- 鎏金瓶盖 -->
                <div class="bottle-cap">
                  <div class="cap-dome"></div>
                  <div class="cap-body">
                    <div class="cap-ridges">
                      <span v-for="n in 14" :key="'cr-' + n" class="cap-ridge" :style="{ left: (n * 6.6 + 1.5) + '%' }"></span>
                    </div>
                    <div class="cap-shine"></div>
                  </div>
                  <div class="cap-ring"></div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <!-- 底部粒子基座 -->
        <div class="reservoir-base">
          <div class="base-particle-ring">
            <div class="ring-glow"></div>
          </div>
          <div class="base-pedestal-glow"></div>
        </div>

        <!-- 满水庆祝 -->
        <div v-if="fillPercent >= 100" class="full-celebration">
          <div class="celebration-particles">
            <span v-for="n in 16" :key="'cp-' + n" class="celebration-particle" :style="getCelebrationStyle(n)"></span>
          </div>
          <div class="full-badge">
            <Sparkles class="w-3.5 h-3.5" />
            <span>蓄水池已满</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 容量设置弹窗 -->
    <Teleport to="body">
      <Transition name="dialog-fade">
        <div v-if="showCapacityDialog" class="capacity-dialog-overlay" @click.self="showCapacityDialog = false">
          <div class="capacity-dialog">
            <div class="dialog-header">
              <div class="dialog-header-icon">
                <Droplets class="w-5 h-5" />
              </div>
              <div class="dialog-header-text">
                <h3 class="dialog-title">设置蓄水池容量</h3>
                <p class="dialog-subtitle">设定你的存款目标</p>
              </div>
              <button class="dialog-close" @click="showCapacityDialog = false">
                <X class="w-4 h-4" />
              </button>
            </div>
            <div class="dialog-body">
              <div class="input-group">
                <label class="input-label">目标容量</label>
                <div class="input-wrapper">
                  <span class="input-prefix">¥</span>
                  <input
                    type="number"
                    v-model.number="tempCapacity"
                    class="dialog-input"
                    placeholder="输入目标金额"
                    min="1"
                    step="1000"
                    @keyup.enter="confirmCapacity"
                    ref="inputRef"
                  />
                </div>
              </div>

              <div class="dialog-hint">
                <div class="hint-icon">
                  <Info class="w-4 h-4" />
                </div>
                <div class="hint-content">
                  <p class="hint-title">存款小贴士</p>
                  <p class="hint-text">设置一个合理的目标，看着蓄水池慢慢填满，享受积累的快乐！</p>
                </div>
              </div>

              <div class="quick-presets">
                <span class="presets-label">快捷设置</span>
                <div class="presets-grid">
                  <button
                    v-for="preset in capacityPresets"
                    :key="preset"
                    class="preset-btn"
                    :class="{ active: tempCapacity === preset }"
                    @click="tempCapacity = preset"
                  >
                    <span class="preset-amount">¥{{ formatShort(preset) }}</span>
                    <span class="preset-full">¥{{ formatNumber(preset) }}</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="dialog-footer">
              <button class="btn-cancel" @click="showCapacityDialog = false">取消</button>
              <button class="btn-confirm" @click="confirmCapacity">
                <Check class="w-4 h-4" />
                确认设置
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { userStorage as localStorage } from '../auth'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  Waves, Settings, Sparkles, Droplets, X, Info, Check,
  TrendingUp, TrendingDown
} from 'lucide-vue-next'
import { fmtNum } from '../utils/formatter'
import { useSoulRingSettings, MAX_SOUL_RINGS } from '../composables/useSoulRingSettings'

const props = defineProps({
  currentAmount: {
    type: Number,
    default: 0
  },
  depositCount: {
    type: Number,
    default: 0
  }
})

const CAPACITY_KEY = 'deposit_reservoir_capacity'
const { ringCount } = useSoulRingSettings()
const DEFAULT_CAPACITY = 500000

const capacity = ref(parseFloat(localStorage.getItem(CAPACITY_KEY)) || DEFAULT_CAPACITY)
const showCapacityDialog = ref(false)
const tempCapacity = ref(capacity.value)
const displayAmount = ref('0')
const waterLevel = ref(0)
const amountChange = ref(0)
const inputRef = ref(null)
const particleCanvas = ref(null)
const glassPathRef = ref(null)

const capacityPresets = [100000, 300000, 500000, 1000000, 2000000, 5000000]

let prevAmount = 0

// 瓶身几何：统一坐标系 240 × 420，中心轴 x = 120
const BOTTLE_W = 240
const BOTTLE_H = 420
const WATER_BOTTOM = 390
const WATER_TOP = 72
const WATER_RANGE = WATER_BOTTOM - WATER_TOP

// 优雅长颈瓶轮廓（瓶颈 98–142，瓶身 34–206，均以 120 为轴）
const glassPath = 'M 104 22 L 136 22 Q 142 22 142 28 L 142 70 Q 142 78 148 84 C 182 108 206 150 206 196 L 206 344 Q 206 392 158 392 L 82 392 Q 34 392 34 344 L 34 196 C 34 150 58 108 92 84 Q 98 78 98 70 L 98 28 Q 98 22 104 22 Z'
const glassClip = `path('${glassPath}')`
const glassPath2D = typeof Path2D !== 'undefined' ? new Path2D(glassPath) : null

// 瓶身在 bottle-stage 中的偏移（stage 318×416，瓶身 240×420，居中对齐）
const BOTTLE_STAGE_LEFT = (318 - BOTTLE_W) / 2
const BOTTLE_STAGE_TOP = (416 - BOTTLE_H) / 2

const waterTopPx = computed(() => {
  const lv = Math.max(0, Math.min(100, waterLevel.value))
  return WATER_BOTTOM - (lv / 100) * WATER_RANGE
})

// 漂浮装饰
const decorations = ref([])
let decoId = 0

const fillPercent = computed(() => {
  if (capacity.value <= 0) return 0
  return Math.min(100, (props.currentAmount / capacity.value) * 100)
})

const percentLevel = computed(() => {
  if (fillPercent.value >= 80) return 'high'
  if (fillPercent.value >= 50) return 'medium'
  return 'normal'
})

// 金额统一带千分位，与其它面板的展示保持一致
function formatNumber(val) {
  const n = parseFloat(val) || 0
  return Math.round(n).toLocaleString('zh-CN')
}

function formatShort(val) {
  if (val >= 10000) {
    return (val / 10000).toFixed(0) + '万'
  }
  return fmtNum(val, 0)
}

// ========== 数字滚动动画 ==========
let amountAnimFrame = null
let currentDisplayValue = 0

// 上涨时长：水位 / 数字 / 进度条共用，改动时需同步 .capacity-bar-fill 的 CSS transition
const RISE_DURATION = 3200

function animateAmount(target) {
  if (amountAnimFrame) cancelAnimationFrame(amountAnimFrame)
  const start = currentDisplayValue
  const diff = target - start
  const duration = RISE_DURATION
  const startTime = performance.now()

  function step(now) {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    currentDisplayValue = start + diff * eased
    displayAmount.value = formatNumber(currentDisplayValue)
    if (progress < 1) {
      amountAnimFrame = requestAnimationFrame(step)
    }
  }
  amountAnimFrame = requestAnimationFrame(step)
}

// ========== 水位动画 ==========
function animateWaterLevel(targetPercent) {
  const startLevel = waterLevel.value
  const diff = targetPercent - startLevel
  const duration = RISE_DURATION
  const startTime = performance.now()

  function step(now) {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    waterLevel.value = startLevel + diff * eased
    if (progress < 1) {
      requestAnimationFrame(step)
    }
  }
  requestAnimationFrame(step)
}

// ========== Canvas 粒子系统 ==========
let canvasCtx = null
let canvasAnimId = null
let particleTime = 0
let outlineParticles = []
let waterParticles = []
let sparkleParticles = []
let glowBlue = null
let glowWhite = null

// 预渲染辉光贴图：替代逐粒子的 shadowBlur —— 每帧上百次模糊是掉帧的主因
function makeGlowSprite(rgb) {
  const size = 64
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, `rgba(${rgb}, 0.95)`)
  grad.addColorStop(0.28, `rgba(${rgb}, 0.5)`)
  grad.addColorStop(0.6, `rgba(${rgb}, 0.14)`)
  grad.addColorStop(1, `rgba(${rgb}, 0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

function drawGlow(x, y, radius, alpha, sprite) {
  if (alpha <= 0.003) return
  canvasCtx.globalAlpha = Math.min(1, alpha)
  canvasCtx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2)
}

function initCanvas() {
  const canvas = particleCanvas.value
  if (!canvas) return
  const dpr = 2
  canvas.width = BOTTLE_W * dpr
  canvas.height = BOTTLE_H * dpr
  canvasCtx = canvas.getContext('2d')
  canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

  glowBlue = makeGlowSprite('130, 205, 255')
  glowWhite = makeGlowSprite('190, 235, 255')

  initOutlineParticles()
  initWaterParticles()
  initSparkleParticles()
}

// 沿瓶身轮廓精确采样粒子
function initOutlineParticles() {
  outlineParticles = []
  const pathEl = glassPathRef.value
  if (!pathEl || typeof pathEl.getTotalLength !== 'function') return
  const total = pathEl.getTotalLength()
  if (!total) return

  const count = 180
  for (let i = 0; i < count; i++) {
    const pt = pathEl.getPointAtLength((i / count) * total)
    outlineParticles.push({
      baseX: pt.x,
      baseY: pt.y,
      size: 0.7 + Math.random() * 1.6,
      speed: 0.3 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
      opacity: 0.35 + Math.random() * 0.6,
      drift: (Math.random() - 0.5) * 3
    })
  }
}

// 水体上升粒子
function initWaterParticles() {
  waterParticles = []
  for (let i = 0; i < 64; i++) {
    waterParticles.push({
      x: 50 + Math.random() * 140,
      y: 150 + Math.random() * 240,
      size: 0.5 + Math.random() * 1.5,
      speed: 0.2 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      opacity: 0.42 + Math.random() * 0.45,
      driftSpeed: (Math.random() - 0.5) * 0.3
    })
  }
}

// 闪烁星点
function initSparkleParticles() {
  sparkleParticles = []
  for (let i = 0; i < 26; i++) {
    sparkleParticles.push({
      x: 46 + Math.random() * 148,
      y: 50 + Math.random() * 320,
      size: 1 + Math.random() * 2,
      speed: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2
    })
  }
}

function drawParticles() {
  if (!canvasCtx || !particleCanvas.value) return
  const ctx = canvasCtx
  ctx.clearRect(0, 0, BOTTLE_W, BOTTLE_H)
  ctx.globalCompositeOperation = 'lighter'

  const surfaceY = waterTopPx.value
  const waterHeight = WATER_BOTTOM - surfaceY

  // 1. 水体粒子与水面波纹
  if (waterHeight > 6 && glassPath2D) {
    ctx.save()
    ctx.clip(glassPath2D)

    for (const p of waterParticles) {
      p.phase += 0.02 * p.speed
      p.y -= p.speed * 0.55
      p.x += Math.sin(p.phase) * p.driftSpeed

      if (p.y < surfaceY + 6 || p.y > WATER_BOTTOM - 4) {
        p.y = WATER_BOTTOM - 8 - Math.random() * 40
        p.x = 50 + Math.random() * 140
      }

      const brightness = 0.5 + Math.sin(p.phase * 2) * 0.35
      const a = p.opacity * brightness
      drawGlow(p.x, p.y, p.size * 5.5, a * 0.9, glowBlue)
      ctx.globalAlpha = Math.min(1, a)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(165, 225, 255, 1)'
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // 水面波纹：宽窄两条描边叠出柔和辉光，替代 shadowBlur
    ctx.beginPath()
    for (let x = 0; x <= BOTTLE_W; x += 4) {
      const off = Math.sin(x * 0.035 + particleTime * 0.05) * 1.8 +
                  Math.sin(x * 0.08 - particleTime * 0.032) * 1
      if (x === 0) ctx.moveTo(x, surfaceY + off)
      else ctx.lineTo(x, surfaceY + off)
    }
    ctx.strokeStyle = 'rgba(140, 212, 255, 0.22)'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.strokeStyle = 'rgba(186, 235, 255, 0.75)'
    ctx.lineWidth = 1.6
    ctx.stroke()

    ctx.restore()
  }

  // 2. 瓶身轮廓粒子
  for (const p of outlineParticles) {
    p.phase += 0.015 * p.speed
    const wobble = Math.sin(p.phase) * p.drift
    const twinkle = 0.6 + Math.sin(p.phase * 2.3) * 0.4
    const a = p.opacity * twinkle
    const x = p.baseX + wobble
    const y = p.baseY + wobble * 0.3

    drawGlow(x, y, p.size * 5.5, a * 0.85, glowBlue)
    ctx.globalAlpha = Math.min(1, a)
    ctx.beginPath()
    ctx.arc(x, y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(214, 242, 255, 1)'
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // 3. 瓶内闪烁星芒
  if (glassPath2D) {
    ctx.save()
    ctx.clip(glassPath2D)

    for (const s of sparkleParticles) {
      s.phase += 0.02 * s.speed
      const opacity = ((Math.sin(s.phase) + 1) / 2) * 0.95

      drawGlow(s.x, s.y, s.size * 9, opacity * 0.8, glowWhite)

      ctx.save()
      ctx.translate(s.x, s.y)
      ctx.rotate(s.phase * 0.5)
      ctx.globalAlpha = opacity
      ctx.fillStyle = 'rgba(255, 255, 255, 1)'

      ctx.beginPath()
      ctx.moveTo(0, -s.size * 3)
      ctx.lineTo(s.size * 0.5, 0)
      ctx.lineTo(0, s.size * 3)
      ctx.lineTo(-s.size * 0.5, 0)
      ctx.closePath()
      ctx.fill()

      ctx.globalAlpha = opacity * 0.7
      ctx.beginPath()
      ctx.moveTo(-s.size * 3, 0)
      ctx.lineTo(0, s.size * 0.5)
      ctx.lineTo(s.size * 3, 0)
      ctx.lineTo(0, -s.size * 0.5)
      ctx.closePath()
      ctx.fill()

      ctx.restore()
    }
    ctx.restore()
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  particleTime += 1
  canvasAnimId = requestAnimationFrame(drawParticles)
}

// ========== 漂浮装饰生成 ==========
const decoTypes = ['star', 'heart', 'diamond', 'square']

function spawnDecoration() {
  const id = decoId++
  const type = decoTypes[Math.floor(Math.random() * decoTypes.length)]
  const side = Math.random() > 0.5 ? 'left' : 'right'
  const startX = side === 'left' ? -10 : 110
  const endX = side === 'left' ? 110 : -10
  const yPos = 15 + Math.random() * 70
  const duration = 8 + Math.random() * 10
  const delay = Math.random() * 2
  const size = 8 + Math.random() * 10

  const deco = {
    id,
    type,
    style: {
      left: startX + '%',
      top: yPos + '%',
      fontSize: size + 'px',
      animation: `decoFloat${side === 'left' ? 'Right' : 'Left'} ${duration}s linear forwards`,
      animationDelay: delay + 's',
      opacity: 0
    }
  }
  decorations.value.push(deco)

  setTimeout(() => {
    decorations.value = decorations.value.filter(d => d.id !== id)
  }, (duration + delay) * 1000)
}

// ========== 样式生成函数 ==========
function getFarStarStyle(n) {
  return {
    left: (n * 37.3) % 100 + '%',
    top: (n * 61.7) % 100 + '%',
    width: (1 + (n % 3)) + 'px',
    height: (1 + (n % 3)) + 'px',
    animationDelay: (n * 0.3) + 's',
    animationDuration: (3 + (n % 4)) + 's'
  }
}

function getNearStarStyle(n) {
  return {
    left: (n * 17.9) % 100 + '%',
    top: (n * 43.7) % 100 + '%',
    width: (2 + (n % 4)) + 'px',
    height: (2 + (n % 4)) + 'px',
    animationDelay: (n * 0.5) + 's',
    animationDuration: (2 + (n % 3)) + 's'
  }
}

// 中层星尘：更细密，构成银河颗粒感
function getDustStarStyle(n) {
  return {
    left: (n * 53.9) % 100 + '%',
    top: (n * 29.3) % 100 + '%',
    width: (1 + (n % 2)) + 'px',
    height: (1 + (n % 2)) + 'px',
    opacity: 0.35 + (n % 5) * 0.13,
    animationDelay: (n * 0.17) + 's',
    animationDuration: (2 + (n % 5)) + 's'
  }
}

// 流星：沿左上方向拖尾划过
function getMeteorStyle(n) {
  return {
    top: ((n * 13) % 62) + '%',
    left: (18 + (n * 21) % 78) + '%',
    animationDelay: (n * 1.9) + 's',
    animationDuration: (4 + (n % 3) * 1.6) + 's'
  }
}

// 环绕瓶身的浮游星尘：黄金角分布 + 分层半径
function getAmbientStarStyle(n) {
  const angle = (n * 137.5) % 360
  const radius = 104 + (n % 8) * 13
  const size = 2 + (n % 4)
  return {
    '--as-angle': angle + 'deg',
    '--as-radius': radius + 'px',
    '--as-size': size + 'px',
    animationDelay: (n * 0.42) + 's',
    animationDuration: (5 + (n % 4) * 1.4) + 's'
  }
}

function getCelebrationStyle(n) {
  const angle = (n / 16) * 360
  const distance = 50 + (n % 4) * 25
  return {
    '--cele-angle': angle + 'deg',
    '--cele-distance': distance + 'px',
    '--cele-delay': (n * 0.06) + 's',
    '--cele-size': (4 + (n % 5) * 2) + 'px'
  }
}

// 节点形状（单位半径，靠 scale 控制大小）
const GLYPHS = {
  star: 'M0,-1 Q0.06,-0.06 1,0 Q0.06,0.06 0,1 Q-0.06,0.06 -1,0 Q-0.06,-0.06 0,-1 Z',
  diamond: 'M0,-1 L1,0 L0,1 L-1,0 Z',
  square: 'M-0.78,-0.78 L0.78,-0.78 L0.78,0.78 L-0.78,0.78 Z',
  tri: 'M0,-1 L0.92,0.72 L-0.92,0.72 Z'
}
// 星链上依次出现的形状：星光为主，穿插菱形 / 方块 / 三角
const NODE_SHAPES = [
  GLYPHS.star, GLYPHS.diamond, GLYPHS.star, GLYPHS.square,
  GLYPHS.diamond, GLYPHS.star, GLYPHS.tri, GLYPHS.diamond
]

// 尘带疏密：三段一组的点线，疏密不均才像星尘
const DUST_PATTERNS = {
  fine:   ['0.5 3.0 0.5 1.9 0.5 4.1', '0.6 2.4 0.6 3.5 0.6 1.7', '0.5 3.6 0.5 2.3 0.5 2.9'],
  normal: ['0.5 4.4 0.5 2.6 0.5 6.0', '0.6 3.4 0.6 5.2 0.6 2.4', '0.5 5.0 0.5 3.2 0.5 4.2'],
  sparse: ['0.5 6.2 0.5 3.6 0.5 8.2', '0.6 4.8 0.6 7.2 0.6 3.4', '0.5 7.0 0.5 4.4 0.5 5.8']
}

// 一条轨道上的节点：形状循环变化，半径带轻微抖动
function buildNodes(total, radius, base) {
  return Array.from({ length: total }, (_, i) => {
    const a = (((i / total) * 360 + (i % 3) * 7) * Math.PI) / 180
    const jitter = [2.2, -1.8, 1.2, -0.6][i % 4]
    const r = radius + jitter
    const size = base + (i % 3) * 0.5
    return {
      x: +(r * Math.cos(a)).toFixed(2),
      y: +(r * Math.sin(a)).toFixed(2),
      s: +size.toFixed(2),
      hs: +(size * 2.3).toFixed(2),
      rot: (i % 4) * 22,
      d: NODE_SHAPES[i % NODE_SHAPES.length]
    }
  })
}

// 一道魂环 = 外 + 内两条双圈尘带 + 两圈星光节点
// cycle：自转周期（秒），越短转得越快
// delay：出生延迟（秒），按 cycle/数量 等间距出生
function makeRing(key, color, glow, cycle, delay, nodeCount, sparks, dust) {
  const d = DUST_PATTERNS[dust]
  const outerR = 139
  const innerR = 124
  return {
    key,
    color,
    glow,
    cycle,
    delay,
    sparks,
    bands: [
      // 外圈尘带（三层叠出厚度）
      { r: outerR - 3.2, w: 1.05, dash: d[0], offset: 0, o: 0.42 },
      { r: outerR,       w: 1.4,  dash: d[1], offset: 11, o: 0.68 },
      { r: outerR + 3.2, w: 0.95, dash: d[2], offset: 23, o: 0.34 },
      // 内圈尘带
      { r: innerR - 2.6, w: 0.8,  dash: d[0], offset: 7, o: 0.28 },
      { r: innerR,       w: 1.05, dash: d[1], offset: 19, o: 0.48 },
      { r: innerR + 2.6, w: 0.7,  dash: d[2], offset: 31, o: 0.24 }
    ],
    nodes: [...buildNodes(nodeCount, outerR, 2.6), ...buildNodes(nodeCount, innerR, 1.9)]
  }
}

const ringHueOffset = Math.random() * 360
const ringPalette = Array.from({ length: MAX_SOUL_RINGS + 2 }, (_, index) =>
  Math.round((ringHueOffset + index * 360 / (MAX_SOUL_RINGS + 2) + Math.random() * 8 - 4 + 360) % 360)
)
function ringColor(slot) {
  const hue = ringPalette[slot]
  return { color: `hsl(${hue} 95% 80%)`, glow: `hsl(${hue} 96% 72% / 0.95)` }
}

// ========== 魂环配置：按设置数量等间距出生，每次重新随机挑选不重复的色相 ==========
const RING_CYCLE = 6.0
const soulRingConfigs = ref([])
let ringGeneration = 0
watch(ringCount, count => {
  ringGeneration += 1
  const slots = Array.from({ length: count }, (_, index) => Math.floor(index * ringPalette.length / count))
  for (let index = slots.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const previousSlot = slots[index]
    slots[index] = slots[swapIndex]
    slots[swapIndex] = previousSlot
  }
  soulRingConfigs.value = slots.map((slot, index) => ({
    ...makeRing(`ring-${ringGeneration}-${index + 1}`, ringColor(slot).color, ringColor(slot).glow,
      RING_CYCLE, RING_CYCLE / count * index, 16, 8, 'normal'),
    slot
  }))
}, { immediate: true })

function onRingBirth(ring, event) {
  if (event.target !== event.currentTarget || !/^soulRingRise(?:-|$)/.test(event.animationName)) return
  const occupied = new Set(soulRingConfigs.value.map(item => item.slot))
  const available = ringPalette.map((_, slot) => slot).filter(slot => !occupied.has(slot))
  const slot = available[Math.floor(Math.random() * available.length)]
  Object.assign(ring, ringColor(slot), { slot })
}

// 把 rgba 光晕色转成更淡的同色（用于水滴星光）
function fadeGlow(glow, alpha) {
  return glow.replace(/[\d.]+\)$/, alpha + ')')
}

// 水滴星光的挂点：贴着外圈尘带，随星链公转
function getSparkSlotStyle(ring, s) {
  const total = ring.sparks
  const angle = (((s - 1) / total) * 360 + (s % 2) * 16) * Math.PI / 180
  const radius = 139 + (s % 3) * 3
  return {
    transform: `translate(${(Math.cos(angle) * radius).toFixed(2)}px, ${(Math.sin(angle) * radius).toFixed(2)}px)`
  }
}

// 水滴从环边切向甩出，再沿径向外飞
function getTearStyle(ring, s) {
  const size = 3.6 + (s % 3) * 0.6
  const angle = (((s - 1) / ring.sparks) * 360 + (s % 2) * 16) * Math.PI / 180
  const outward = 28 + (s % 3) * 6
  const tangent = -(80 + (s % 3) * 10)
  const radialX = Math.cos(angle) * outward
  const radialY = Math.sin(angle) * outward
  const tangentX = -Math.sin(angle) * tangent
  const tangentY = Math.cos(angle) * tangent
  return {
    '--tear-size': size.toFixed(1) + 'px',
    '--tear-heading': (Math.atan2(tangentY, tangentX) * 180 / Math.PI + 45).toFixed(2) + 'deg',
    '--fly-mid-x': (tangentX * 0.55 + radialX * 0.22).toFixed(2) + 'px',
    '--fly-mid-y': (tangentY * 0.55 + radialY * 0.22).toFixed(2) + 'px',
    '--fly-x': (tangentX + radialX).toFixed(2) + 'px',
    '--fly-y': (tangentY + radialY).toFixed(2) + 'px',
    '--fly-end-x': (tangentX * 1.18 + radialX * 1.35).toFixed(2) + 'px',
    '--fly-end-y': (tangentY * 1.18 + radialY * 1.35).toFixed(2) + 'px',
    background: `linear-gradient(180deg, #ffffff, ${ring.color})`,
    boxShadow: `0 0 ${(size * 2.4).toFixed(1)}px ${fadeGlow(ring.glow, 0.9)}`,
    animationDelay: (-((s - 1) * (1.4 / ring.sparks))).toFixed(2) + 's'
  }
}

// ========== 事件处理 ==========
function confirmCapacity() {
  if (tempCapacity.value > 0) {
    capacity.value = tempCapacity.value
    localStorage.setItem(CAPACITY_KEY, capacity.value.toString())
    animateWaterLevel(fillPercent.value)
  }
  showCapacityDialog.value = false
}

// ========== 监听金额变化 ==========
watch(() => props.currentAmount, (newVal, oldVal) => {
  amountChange.value = newVal - oldVal
  animateAmount(newVal)
  animateWaterLevel(fillPercent.value)

  // 金额增加时触发更多装饰
  if (newVal > oldVal) {
    const diff = newVal - oldVal
    const extraCount = Math.min(6, Math.max(1, Math.floor(diff / 2000)))
    for (let i = 0; i < extraCount; i++) {
      setTimeout(() => spawnDecoration(), i * 300)
    }
  }

  setTimeout(() => {
    amountChange.value = 0
  }, 3000)
})

watch(showCapacityDialog, async (val) => {
  if (val) {
    tempCapacity.value = capacity.value
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  }
})

// ========== 生命周期 ==========
let decoSpawnInterval = null

onMounted(async () => {
  prevAmount = props.currentAmount
  currentDisplayValue = 0

  await nextTick()
  initCanvas()
  drawParticles()

  // 入场动画
  setTimeout(() => {
    animateAmount(props.currentAmount)
  }, 300)
  setTimeout(() => {
    animateWaterLevel(fillPercent.value)
  }, 500)

  // 定期生成漂浮装饰
  decoSpawnInterval = setInterval(() => {
    if (decorations.value.length < 8) {
      spawnDecoration()
    }
  }, 2500)

  // 初始生成几个
  for (let i = 0; i < 3; i++) {
    setTimeout(() => spawnDecoration(), i * 800)
  }

  window.addEventListener('resize', initCanvas)
})

onBeforeUnmount(() => {
  if (amountAnimFrame) cancelAnimationFrame(amountAnimFrame)
  if (canvasAnimId) cancelAnimationFrame(canvasAnimId)
  if (decoSpawnInterval) clearInterval(decoSpawnInterval)
  window.removeEventListener('resize', initCanvas)
})
</script>

<style scoped>
/* ========== 整体容器 - 粒子星空主题 ========== */
.reservoir-wrapper.particle-theme {
  position: relative;
  width: 100%;
  margin-bottom: 10px;
  padding: 0 5px;
  overflow: hidden;
  border-radius: 28px;
}

/* 星空背景 */
.starfield-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, #0a0e1a 0%, #0d1525 40%, #0f1a2e 100%);
  overflow: hidden;
  z-index: 0;
}

/* 星空缓慢整体旋转 */
.star-rotator {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1600px;
  height: 1600px;
  margin: -800px 0 0 -800px;
  animation: starRotate 300s linear infinite;
  will-change: transform;
}

@keyframes starRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.stars-layer {
  position: absolute;
  inset: 0;
}

/* 星空缓缓漂移：三层不同速度形成视差 */
.stars-far { animation: starDriftFar 96s linear infinite; }
.stars-dust { animation: starDriftDust 68s linear infinite; }
.stars-near { animation: starDriftNear 46s linear infinite; }

@keyframes starDriftFar {
  0% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(-42px, 22px, 0); }
  100% { transform: translate3d(0, 0, 0); }
}

@keyframes starDriftDust {
  0% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(34px, -20px, 0); }
  100% { transform: translate3d(0, 0, 0); }
}

@keyframes starDriftNear {
  0% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(-28px, 30px, 0); }
  100% { transform: translate3d(0, 0, 0); }
}

.star {
  position: absolute;
  border-radius: 50%;
  background: white;
  animation: starTwinkle ease-in-out infinite;
}

.stars-far .star {
  background: rgba(200, 220, 255, 0.6);
  box-shadow: 0 0 3px rgba(150, 200, 255, 0.4);
}

.stars-dust .star {
  background: rgba(185, 212, 255, 0.85);
  box-shadow: 0 0 4px rgba(140, 190, 255, 0.55);
}

.stars-near .star {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 6px rgba(150, 200, 255, 0.6);
}

@keyframes starTwinkle {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

.nebula {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.3;
}

.nebula-1 {
  width: 400px;
  height: 400px;
  top: -100px;
  left: -100px;
  background: radial-gradient(circle, rgba(60, 100, 200, 0.4), transparent 70%);
  animation: nebulaFloat 12s ease-in-out infinite;
}

.nebula-2 {
  width: 350px;
  height: 350px;
  bottom: -80px;
  right: -80px;
  background: radial-gradient(circle, rgba(100, 60, 180, 0.3), transparent 70%);
  animation: nebulaFloat 15s ease-in-out infinite reverse;
}

@keyframes nebulaFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -20px) scale(1.1); }
}

.nebula-3 {
  width: 320px;
  height: 320px;
  top: 12%;
  right: 6%;
  background: radial-gradient(circle, rgba(60, 175, 190, 0.24), transparent 70%);
  animation: nebulaFloat 18s ease-in-out infinite;
  animation-delay: -6s;
}

/* ========== 看板银河 ========== */
.galaxy-band {
  position: absolute;
  top: 50%;
  left: -20%;
  width: 140%;
  height: 300px;
  transform: translateY(-50%) rotate(-16deg);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(90, 130, 220, 0.05) 18%,
    rgba(140, 170, 255, 0.14) 42%,
    rgba(205, 190, 255, 0.2) 50%,
    rgba(140, 170, 255, 0.14) 58%,
    rgba(90, 130, 220, 0.05) 82%,
    transparent 100%
  );
  filter: blur(30px);
  opacity: 0.85;
  animation: galaxyDrift 26s ease-in-out infinite;
  pointer-events: none;
}

.galaxy-core {
  position: absolute;
  top: 50%;
  left: 46%;
  width: 360px;
  height: 190px;
  transform: translate(-50%, -50%) rotate(-16deg);
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 242, 220, 0.32) 0%,
    rgba(190, 205, 255, 0.2) 28%,
    rgba(120, 150, 255, 0.1) 55%,
    transparent 76%
  );
  filter: blur(42px);
  animation: galaxyCorePulse 11s ease-in-out infinite;
  pointer-events: none;
}

@keyframes galaxyDrift {
  0%, 100% { transform: translateY(-50%) rotate(-16deg) scale(1); opacity: 0.75; }
  50% { transform: translateY(-52%) rotate(-13deg) scale(1.06); opacity: 0.95; }
}

@keyframes galaxyCorePulse {
  0%, 100% { transform: translate(-50%, -50%) rotate(-16deg) scale(1); opacity: 0.7; }
  50% { transform: translate(-50%, -50%) rotate(-16deg) scale(1.12); opacity: 1; }
}

/* ========== 流星 ========== */
.meteor-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.meteor {
  position: absolute;
  width: 130px;
  height: 1.6px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(190, 225, 255, 0.65) 22%,
    rgba(140, 195, 255, 0.25) 55%,
    transparent 100%
  );
  opacity: 0;
  transform: rotate(-38deg);
  animation: meteorFall linear infinite;
  filter: drop-shadow(0 0 5px rgba(160, 210, 255, 0.9));
}

@keyframes meteorFall {
  0% {
    transform: translate3d(0, 0, 0) rotate(-38deg) scaleX(0.6);
    opacity: 0;
  }
  8% {
    opacity: 1;
    transform: translate3d(-40px, 31px, 0) rotate(-38deg) scaleX(1);
  }
  72% {
    opacity: 1;
  }
  100% {
    transform: translate3d(-560px, 438px, 0) rotate(-38deg) scaleX(1);
    opacity: 0;
  }
}

/* 主容器 */
.reservoir-container {
  position: relative;
  display: flex;
  align-items: center;
  gap: 30px;
  padding: 8px 28px;
  background: transparent;
  border-radius: 28px;
  border: 1px solid rgba(100, 150, 255, 0.1);
  box-shadow:
    inset 0 1px 0 rgba(150, 200, 255, 0.05),
    0 0 60px rgba(60, 100, 200, 0.1);
  overflow: hidden;
  z-index: 1;
}

/* 边缘光效 */
.reservoir-container::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 28px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(100, 180, 255, 0.3), transparent 40%, transparent 60%, rgba(150, 100, 255, 0.2));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

/* ========== 左侧信息 - 深色主题 ========== */
.reservoir-info {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 2;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.info-icon {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  border-radius: 14px;
  color: white;
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
}

.icon-ripple {
  position: absolute;
  inset: -4px;
  border-radius: 18px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  animation: iconRipple 2s ease-out infinite;
}

.icon-ripple-2 {
  animation-delay: 1s;
}

@keyframes iconRipple {
  0% { transform: scale(0.8); opacity: 0.8; }
  100% { transform: scale(1.4); opacity: 0; }
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-title {
  font-size: 20px;
  font-weight: 800;
  color: #e0f2fe;
  letter-spacing: 0.5px;
  text-shadow: 0 0 20px rgba(100, 180, 255, 0.3);
}

.info-subtitle {
  font-size: 12px;
  color: #64748b;
}

.info-amount {
  margin-bottom: 20px;
  position: relative;
}

.amount-label {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 8px;
  display: block;
  font-weight: 500;
}

.amount-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.amount-currency {
  font-size: 22px;
  font-weight: 600;
  color: #60a5fa;
}

.amount-number {
  font-size: 34px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: -1px;
  background: linear-gradient(135deg, #93c5fd 0%, #60a5fa 50%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 2px 20px rgba(96, 165, 250, 0.3));
}

.amount-trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 3px 10px;
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  animation: trendIn 0.5s ease-out;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

@keyframes trendIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.info-capacity {
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(100, 150, 255, 0.15);
  border-radius: 16px;
  padding: 10px 15px;
  box-shadow: inset 0 1px 0 rgba(150, 200, 255, 0.05);
}

.capacity-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 7px;
}

.capacity-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.capacity-label {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 600;
}

.capacity-edit-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  transition: all 0.25s ease;
  border: none;
  cursor: pointer;
}

.capacity-edit-btn:hover {
  background: rgba(59, 130, 246, 0.25);
  transform: rotate(45deg);
}

.capacity-amount {
  font-size: 16px;
  font-weight: 700;
  color: #cbd5e1;
  font-variant-numeric: tabular-nums;
}

.capacity-bar-wrapper {
  margin-bottom: 9px;
}

.capacity-bar {
  position: relative;
  height: 12px;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(100, 150, 255, 0.1);
}

.capacity-bar-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.2), transparent);
}

.capacity-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 999px;
  /* 时长与缓动需与 JS 的 RISE_DURATION / easeOutCubic 保持一致，否则进度条与水位会脱节 */
  transition: width 3.2s cubic-bezier(0.33, 1, 0.68, 1);
  overflow: hidden;
}

.bar-fill-inner {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #2563eb, #3b82f6, #8b5cf6);
  border-radius: 999px;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}

.bar-fill-shine {
  position: absolute;
  top: 0;
  left: -50%;
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  border-radius: 999px;
  animation: barShine 2.5s ease-in-out infinite;
}

@keyframes barShine {
  0% { transform: translateX(0); opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { transform: translateX(350%); opacity: 0; }
}

.capacity-bar-marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bar-mark {
  position: absolute;
  top: 25%;
  bottom: 25%;
  width: 1px;
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(-50%);
}

.capacity-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 10px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.capacity-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cap-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cap-stat.main {
  flex: 1.2;
}

.cap-stat-value {
  font-size: 21px;
  font-weight: 800;
  color: #60a5fa;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-shadow: 0 0 15px rgba(96, 165, 250, 0.3);
}

.cap-stat-value.small {
  font-size: 14px;
  color: #cbd5e1;
  text-shadow: none;
}

.cap-stat-value.percent-high {
  color: #f87171;
  text-shadow: 0 0 15px rgba(248, 113, 113, 0.3);
}

.cap-stat-value.percent-medium {
  color: #fbbf24;
  text-shadow: 0 0 15px rgba(251, 191, 36, 0.3);
}

.cap-stat-label {
  font-size: 11px;
  color: #64748b;
}

.cap-stat-divider {
  width: 1px;
  height: 24px;
  background: rgba(100, 150, 255, 0.15);
}

/* ========== 粒子蓄水池 3D ========== */
.reservoir-3d-wrapper {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 2;
  align-self: stretch;
  justify-content: center;
}

/* 隐藏路径定义 */
.bottle-path-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.reservoir-3d-scene {
  position: relative;
  perspective: 1400px;
  perspective-origin: 50% 42%;
}

.outer-glow {
  position: absolute;
  inset: -40px;
  background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.18) 0%, transparent 62%);
  filter: blur(24px);
  pointer-events: none;
}

/* ========== 召唤魂环（前后双层 + 瓶形遮罩） ========== */
/* 前层（z=6）：只留近半环（下半），压在瓶身前
   后层（z=0）：用瓶身轮廓做反向 mask——正对着瓶身的地方看不见，
   只在瓶身左右两侧露出一小段弧，这样环看起来真的绕到瓶后去了 */
.soul-rings {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}

.soul-rings-back  { z-index: 0; }
.soul-rings-front { z-index: 6; }

/* 后层：用瓶身形状挖掉中间，只留两侧边缘的弧
   mask 作用在整个后层容器上（屏幕空间），所以对位是精确的 */
.soul-rings-back {
  position: absolute;
  left: -350px;
  top: -300px;
  width: 1018px;
  height: 1016px;
  mask: url(#soulBackMask);
  -webkit-mask: url(#soulBackMask);
}

/* 后层里的魂环以 stage 中心为基准定位 */
.soul-rings-back .soul-ring {
  left: calc(50% - 200px);
  top: calc(50% - 200px);
}

.soul-ring {
  position: absolute;
  left: -200px;
  top: -200px;
  width: 400px;
  height: 400px;
  opacity: 0;
  transform: translateY(182px) scale(0.05, 0.014);
  transform-origin: 50% 50%;
  animation: soulRingRise 6s linear infinite;
  will-change: transform, opacity;
}

.soul-half { position: absolute; inset: 0; }
.soul-half,
.soul-chain,
.soul-spark-slot { background: transparent; overflow: visible; }
.soul-rings-back .soul-half { clip-path: inset(-100% -100% 50% -100%); }

.soul-rings-front .soul-half { clip-path: inset(50% -100% -100% -100%); animation: soulFrontReveal 6s linear infinite; animation-duration: inherit; animation-delay: inherit; }

/* 后层稍微压暗，模拟"隔着玻璃"的感觉 */
.soul-rings-back .chain-dust circle { opacity: 0.55; }
.soul-rings-back .chain-stars { opacity: 0.65; }
.soul-rings-back .soul-chain { opacity: 0.5; }

/* 星链自转：匀速，无停顿，和上升动画同周期，接缝落在消隐瞬间 */
.soul-chain {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  animation: soulSpin 6s linear infinite;
  will-change: transform;
}

@keyframes soulSpin {
  from { transform: rotate(360deg); }
  to   { transform: rotate(0deg); }
}


/* 双圈星链 SVG */
.chain-svg {
  position: absolute;
  left: 0;
  top: 0;
  width: 400px;
  height: 400px;
  overflow: visible;
  animation: soulSpin 6s linear infinite;
  will-change: transform;
  backface-visibility: hidden;
  shape-rendering: geometricPrecision;
}

/* 尘带：细亮点连成的星尘 */
.chain-dust circle {
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

/* 节点柔光 */
.chain-star-halo {
  opacity: 0.62;
}

/* 星链整体呼吸 */
.chain-stars {
  animation: chainTwinkle 2.8s ease-in-out infinite;
}

@keyframes chainTwinkle {
  0%, 100% { opacity: 0.66; }
  45%      { opacity: 1; }
}

/* 水滴星光的挂点（只负责定位，不做旋转） */
.soul-spark-slot {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  display: block;
  font-size: 0;
  line-height: 0;
  background: transparent;
  border: 0;
}

/* 水滴状星光：一头圆一头尖，尖端朝向环心（即运动反方向），边向外飞散边淡出 */
.soul-tear {
  position: absolute;
  left: calc(var(--tear-size, 4px) / -2);
  top: calc(var(--tear-size, 4px) / -2);
  width: var(--tear-size, 4px);
  height: var(--tear-size, 4px);
  border-radius: 70% 70% 70% 12%;
  display: block;
  background-color: transparent;
  border: 0;
  transform-origin: 50% 50%;
  animation: sparkFly 1.4s linear infinite;
  will-change: transform, opacity;
}

/* 甩出的轨迹：先被离心力沿切向带偏，再顺惯性甩成弧线，边飞边收细变暗 */
@keyframes sparkFly {
  0% {
    transform: translate(0, 0) rotate(var(--tear-heading)) scale(0.2, 0.55);
    opacity: 0;
  }
  9% {
    opacity: 1;
  }
  20% {
    transform: translate(var(--fly-mid-x), var(--fly-mid-y)) rotate(var(--tear-heading)) scale(0.9, 1.25);
    opacity: 1;
  }
  65% {
    transform: translate(var(--fly-x), var(--fly-y)) rotate(var(--tear-heading)) scale(0.72, 0.92);
    opacity: 0.62;
  }
  100% {
    transform: translate(var(--fly-end-x), var(--fly-end-y)) rotate(var(--tear-heading)) scale(0.08, 0.24);
    opacity: 0;
  }
}

@keyframes soulRingRise {
  0% {
    opacity: 0;
    transform: translateY(182px) scale(0.05, 0.014);
  }
  8% {
    opacity: 0.9;
    transform: translateY(182px) scale(0.22, 0.061);
  }
  24% {
    opacity: 1;
    transform: translateY(182px) scale(0.68, 0.187);
  }
  90% {
    opacity: 0.85;
    transform: translateY(-158px) scale(1.55, 0.42625);
  }
  100% {
    opacity: 0;
    transform: translateY(-190px) scale(1.75, 0.48125);
  }
}

@keyframes soulFrontReveal {
  0%, 16% { opacity: 0; }
  24%, 100% { opacity: 1; }
}

/* ========== 环绕浮游星尘 ========== */
.ambient-stars {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  z-index: 1;
  pointer-events: none;
  animation: ambientRotate 64s linear infinite;
}

.ambient-star {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--as-size);
  height: var(--as-size);
  margin: calc(var(--as-size) / -2) 0 0 calc(var(--as-size) / -2);
  border-radius: 50%;
  background: rgba(226, 243, 255, 1);
  box-shadow:
    0 0 3px rgba(255, 255, 255, 0.9),
    0 0 12px rgba(150, 210, 255, 1);
  transform: rotate(var(--as-angle)) translateY(calc(-1 * var(--as-radius)));
  animation: ambientTwinkle ease-in-out infinite;
}

@keyframes ambientRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes ambientTwinkle {
  0%, 100% { opacity: 0.34; }
  50% { opacity: 1; }
}

/* 瓶子舞台容器：高度贴合瓶身，避免底部留白 */
.bottle-stage {
  position: relative;
  width: 318px;
  height: 416px;
  perspective: 1400px;
  perspective-origin: 50% 42%;
  z-index: 2;
}

.bottle-motion {
  position: absolute;
  inset: 0;
  isolation: isolate;
  animation: bottleFloat 6s ease-in-out infinite;
  will-change: transform;
}

/* 居中层：让瓶体轴线始终与舞台中心对齐 */
.bottle-anchor {
  z-index: 2;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 粒子水瓶主体：坐标系 240 × 420，中心轴 x = 120 */
.particle-bottle {
  position: relative;
  width: 240px;
  height: 420px;
  transform-style: preserve-3d;
}

@keyframes bottleFloat {
  0%   { transform: translateY(15px) rotateY(-7deg) rotateZ(-1deg) scale(1.06); }
  25%  { transform: translateY(9px) rotateY(0deg) rotateZ(0deg) scale(1.06); }
  50%  { transform: translateY(3px) rotateY(7deg) rotateZ(1deg) scale(1.06); }
  75%  { transform: translateY(9px) rotateY(0deg) rotateZ(0deg) scale(1.06); }
  100% { transform: translateY(15px) rotateY(-7deg) rotateZ(-1deg) scale(1.06); }
}

/* 瓶身轮廓外发光 */
.glass-rim-glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(
    140deg,
    rgba(105, 180, 255, 0.5) 0%,
    rgba(165, 125, 255, 0.32) 50%,
    rgba(105, 205, 255, 0.44) 100%
  );
  filter: blur(14px);
  opacity: 1;
  pointer-events: none;
}

/* 瓶身基础体 */
.bottle-glass {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

/* 玻璃体积：上亮下暗的纵深 */
.glass-volume {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(150, 200, 255, 0.12) 0%,
    rgba(90, 150, 235, 0.06) 20%,
    rgba(40, 90, 175, 0.04) 55%,
    rgba(18, 48, 115, 0.14) 100%
  );
}

/* 竖直棱面：水晶切割感 */
.glass-facets {
  position: absolute;
  inset: 0;
  mix-blend-mode: screen;
  background: linear-gradient(
    90deg,
    transparent 0%,
    transparent 16%,
    rgba(255, 255, 255, 0.055) 18%,
    transparent 20%,
    transparent 38%,
    rgba(255, 255, 255, 0.035) 40%,
    transparent 42%,
    transparent 58%,
    rgba(255, 255, 255, 0.05) 60%,
    transparent 62%,
    transparent 80%,
    rgba(255, 255, 255, 0.03) 82%,
    transparent 84%,
    transparent 100%
  );
}

/* 瓶肩内阴影 */
.glass-shoulder-shadow {
  position: absolute;
  top: 78px;
  left: 0;
  right: 0;
  height: 120px;
  background: radial-gradient(
    ellipse 78% 100% at 50% 0%,
    rgba(12, 34, 80, 0.42) 0%,
    rgba(12, 34, 80, 0.12) 45%,
    transparent 72%
  );
}

/* 瓶底内阴影 */
.glass-floor-shadow {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: radial-gradient(
    ellipse 82% 100% at 50% 100%,
    rgba(10, 30, 80, 0.5) 0%,
    rgba(10, 30, 80, 0.15) 45%,
    transparent 74%
  );
}

/* 水体层 */
.water-3d {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  overflow: hidden;
}

.water-body {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

.water-depth {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(96, 190, 255, 0.30) 0%,
    rgba(58, 138, 255, 0.34) 22%,
    rgba(34, 96, 220, 0.42) 62%,
    rgba(20, 62, 170, 0.52) 100%
  );
}

/* 水下光斑 */
.water-caustics {
  position: absolute;
  inset: 0;
  mix-blend-mode: screen;
  background:
    radial-gradient(ellipse 40% 14% at 32% 18%, rgba(190, 235, 255, 0.35), transparent 70%),
    radial-gradient(ellipse 30% 10% at 68% 40%, rgba(160, 220, 255, 0.25), transparent 70%),
    radial-gradient(ellipse 46% 12% at 50% 70%, rgba(140, 210, 255, 0.18), transparent 70%);
  animation: causticDrift 9s ease-in-out infinite;
}

@keyframes causticDrift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.8; }
  50% { transform: translate3d(-6px, -10px, 0) scale(1.06); opacity: 1; }
}

/* 水面下方的亮带 */
.water-sheen {
  position: absolute;
  left: 0;
  right: 0;
  height: 26px;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(190, 235, 255, 0.45) 0%,
    rgba(150, 215, 255, 0.18) 45%,
    transparent 100%
  );
  filter: blur(3px);
}

/* 水面 */
.water-surface {
  position: absolute;
  left: 0;
  right: 0;
  height: 16px;
  z-index: 3;
  transform: translateY(-50%);
  pointer-events: none;
}

.surface-ellipse {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 84%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(210, 240, 255, 0.55) 0%,
    rgba(150, 215, 255, 0.32) 45%,
    rgba(90, 165, 255, 0.12) 72%,
    transparent 100%
  );
  filter: blur(2px);
}

.surface-line {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 62%;
  height: 3px;
  border-radius: 50%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(200, 240, 255, 0.5) 18%,
    rgba(255, 255, 255, 0.95) 50%,
    rgba(200, 240, 255, 0.5) 82%,
    transparent
  );
  filter: blur(0.6px);
}

/* 玻璃光泽层 */
.glass-finish {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}

.glass-specular {
  position: absolute;
  border-radius: 50%;
  filter: blur(6px);
}

.glass-specular-left {
  top: 192px;
  left: 46px;
  width: 22px;
  height: 152px;
  background: linear-gradient(
    180deg,
    rgba(235, 248, 255, 0) 0%,
    rgba(235, 248, 255, 0.5) 12%,
    rgba(215, 240, 255, 0.34) 55%,
    rgba(235, 248, 255, 0.46) 88%,
    rgba(235, 248, 255, 0) 100%
  );
}

.glass-specular-right {
  top: 210px;
  right: 52px;
  width: 8px;
  height: 130px;
  background: linear-gradient(
    180deg,
    rgba(215, 240, 255, 0) 0%,
    rgba(215, 240, 255, 0.34) 15%,
    rgba(190, 225, 255, 0.22) 55%,
    rgba(215, 240, 255, 0.3) 88%,
    rgba(215, 240, 255, 0) 100%
  );
  filter: blur(4px);
}

/* 精确轮廓描边 */
.glass-rim-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 0 6px rgba(90, 165, 255, 0.55));
}

/* Canvas 粒子层 */
.particle-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

/* 瓶颈鎏金环 */
.neck-band {
  position: absolute;
  top: 58px;
  left: 50%;
  transform: translateX(-50%);
  width: 52px;
  height: 11px;
  z-index: 15;
}

.band-body {
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background: linear-gradient(
    180deg,
    #f7e6b0 0%,
    #e3c675 22%,
    #c9a548 52%,
    #9d7c26 78%,
    #6f5514 100%
  );
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}

.band-shine {
  position: absolute;
  top: 1px;
  left: 6px;
  right: 6px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.75), transparent);
}

/* 鎏金瓶盖 */
.bottle-cap {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 58px;
  height: 34px;
  z-index: 20;
}

.cap-dome {
  position: absolute;
  top: 0;
  left: 0;
  width: 58px;
  height: 16px;
  border-radius: 29px 29px 6px 6px;
  background: linear-gradient(
    180deg,
    #fdf3d0 0%,
    #f0dc9a 28%,
    #d9bf6d 62%,
    #b8993f 100%
  );
  box-shadow:
    inset 0 2px 2px rgba(255, 255, 255, 0.75),
    0 3px 10px rgba(0, 0, 0, 0.4);
}

.cap-body {
  position: absolute;
  top: 13px;
  left: 0;
  width: 58px;
  height: 20px;
  border-radius: 4px 4px 8px 8px;
  background: linear-gradient(
    90deg,
    #6d5416 0%,
    #a8862f 12%,
    #d5b95f 30%,
    #f2e2a8 48%,
    #dcc172 66%,
    #ab8b34 84%,
    #6b5214 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    0 4px 10px rgba(0, 0, 0, 0.42);
  overflow: hidden;
}

.cap-ridges {
  position: absolute;
  inset: 0;
}

.cap-ridge {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 1px;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.28),
    rgba(0, 0, 0, 0.06),
    rgba(0, 0, 0, 0.28)
  );
}

.cap-shine {
  position: absolute;
  top: 2px;
  left: 10px;
  width: 5px;
  height: 16px;
  border-radius: 3px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.8),
    rgba(255, 255, 255, 0.05)
  );
  filter: blur(0.6px);
}

.cap-ring {
  position: absolute;
  bottom: -2px;
  left: 3px;
  right: 3px;
  height: 5px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(250, 220, 130, 0.5),
    transparent 72%
  );
  filter: blur(2px);
}

/* 漂浮装饰 */
.float-decorations {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  overflow: visible;
}

.deco-item {
  position: absolute;
  font-weight: bold;
  text-shadow: 0 0 10px currentColor;
  filter: drop-shadow(0 0 6px currentColor);
}

.deco-star {
  color: #fef08a;
}

.deco-heart {
  color: #f472b6;
}

.deco-diamond {
  color: #67e8f9;
}

.deco-square {
  color: #c4b5fd;
}

@keyframes decoFloatRight {
  0% {
    opacity: 0;
    transform: translateY(0) rotate(0deg) scale(0.5);
  }
  10% {
    opacity: 0.8;
    transform: translateY(-10px) rotate(36deg) scale(1);
  }
  90% {
    opacity: 0.8;
  }
  100% {
    opacity: 0;
    transform: translateY(-50px) rotate(360deg) scale(0.8);
    left: 110%;
  }
}

@keyframes decoFloatLeft {
  0% {
    opacity: 0;
    transform: translateY(0) rotate(0deg) scale(0.5);
  }
  10% {
    opacity: 0.8;
    transform: translateY(-10px) rotate(-36deg) scale(1);
  }
  90% {
    opacity: 0.8;
  }
  100% {
    opacity: 0;
    transform: translateY(-50px) rotate(-360deg) scale(0.8);
    left: -10%;
  }
}

/* ========== 底部粒子基座 ========== */
.reservoir-base {
  margin-top: -30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.base-particle-ring {
  width: 190px;
  height: 16px;
  position: relative;
}

.ring-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.3), transparent 70%);
  filter: blur(8px);
}

.base-pedestal-glow {
  width: 214px;
  height: 16px;
  background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.2), transparent 70%);
  filter: blur(6px);
  margin-top: -4px;
}

/* ========== 满水庆祝 ========== */
.full-celebration {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  pointer-events: none;
}

.celebration-particles {
  position: absolute;
  top: -10px;
  left: 50%;
  width: 1px;
  height: 1px;
}

.celebration-particle {
  position: absolute;
  width: var(--cele-size);
  height: var(--cele-size);
  background: radial-gradient(circle at 30% 30%, #fef9c3, #facc15);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(250, 204, 21, 0.6);
  animation: celebrationBurst 1.8s ease-out infinite;
  animation-delay: var(--cele-delay);
  opacity: 0;
}

@keyframes celebrationBurst {
  0% {
    transform: translate(0, 0) scale(0);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform:
      translateX(calc(cos(var(--cele-angle)) * var(--cele-distance)))
      translateY(calc(sin(var(--cele-angle)) * var(--cele-distance) * -1 - 20px))
      scale(0.3);
    opacity: 0;
  }
}

.full-badge {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  box-shadow:
    0 4px 16px rgba(245, 158, 11, 0.4),
    0 0 30px rgba(245, 158, 11, 0.2);
  animation: fullBadgeFloat 2s ease-in-out infinite;
  top: -30px;
  white-space: nowrap;
}

@keyframes fullBadgeFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* ========== 弹窗 ========== */
.capacity-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.capacity-dialog {
  width: 420px;
  max-width: calc(100vw - 40px);
  background: linear-gradient(160deg, #0f172a, #1e293b);
  border-radius: 24px;
  overflow: hidden;
  box-shadow:
    0 40px 100px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(100, 150, 255, 0.1) inset;
  animation: dialogIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 24px;
  background: linear-gradient(135deg, rgba(30, 58, 138, 0.3), rgba(79, 70, 229, 0.2));
  border-bottom: 1px solid rgba(100, 150, 255, 0.1);
  position: relative;
  overflow: hidden;
}

.dialog-header::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.15), transparent 70%);
  border-radius: 50%;
}

.dialog-header-icon {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  border-radius: 14px;
  color: white;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
  z-index: 1;
}

.dialog-header-text {
  flex: 1;
  z-index: 1;
}

.dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: #e0f2fe;
  margin: 0 0 2px 0;
}

.dialog-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

.dialog-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 1;
}

.dialog-close:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  transform: rotate(90deg);
}

.dialog-body {
  padding: 24px;
}

.input-group {
  margin-bottom: 18px;
}

.input-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 8px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-prefix {
  position: absolute;
  left: 16px;
  font-size: 18px;
  font-weight: 700;
  color: #60a5fa;
  pointer-events: none;
}

.dialog-input {
  width: 100%;
  padding: 14px 16px 14px 36px;
  font-size: 18px;
  font-weight: 700;
  color: #93c5fd;
  border: 2px solid rgba(59, 130, 246, 0.2);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.8);
  outline: none;
  transition: all 0.25s;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
}

.dialog-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.15);
  background: #0f172a;
}

.dialog-hint {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(30, 58, 138, 0.2), rgba(79, 70, 229, 0.15));
  border-radius: 14px;
  border: 1px solid rgba(59, 130, 246, 0.1);
  margin-bottom: 18px;
}

.hint-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.2);
  border-radius: 10px;
  color: #60a5fa;
}

.hint-content {
  flex: 1;
  min-width: 0;
}

.hint-title {
  font-size: 12px;
  font-weight: 600;
  color: #93c5fd;
  margin: 0 0 2px 0;
}

.hint-text {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
}

.quick-presets {
  margin-top: 4px;
}

.presets-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 10px;
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 8px;
  background: rgba(30, 41, 59, 0.8);
  border: 1.5px solid rgba(100, 150, 255, 0.15);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  color: #94a3b8;
}

.preset-btn:hover {
  border-color: #3b82f6;
  background: rgba(30, 58, 138, 0.3);
}

.preset-btn.active {
  border-color: #3b82f6;
  background: linear-gradient(135deg, rgba(30, 64, 175, 0.4), rgba(79, 70, 229, 0.3));
  box-shadow: 0 2px 12px rgba(59, 130, 246, 0.2);
}

.preset-amount {
  font-size: 14px;
  font-weight: 700;
  color: #60a5fa;
}

.preset-full {
  font-size: 10px;
  color: #64748b;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 18px 24px;
  border-top: 1px solid rgba(100, 150, 255, 0.08);
  background: rgba(15, 23, 42, 0.5);
}

.btn-cancel {
  padding: 10px 22px;
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(30, 41, 59, 0.8);
  border: 1.5px solid rgba(100, 150, 255, 0.15);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: rgba(51, 65, 85, 0.8);
  color: #cbd5e1;
  border-color: rgba(100, 150, 255, 0.25);
}

.btn-confirm {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  font-size: 13px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.3s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

/* ========== 响应式 ========== */
@media (max-width: 860px) {
  .reservoir-container {
    flex-direction: column;
    padding: 24px 20px;
    gap: 32px;
  }

  .reservoir-info {
    width: 100%;
  }

  .amount-number {
    font-size: 34px;
  }
}
</style>
