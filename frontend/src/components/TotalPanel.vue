<template>
  <nav
    id="totalPanel"
    ref="railRef"
    class="dock-rail"
    :class="{ 'is-sub-open': subOpen }"
    @mouseenter="cancelSubmenuClose"
    @mouseleave="queueSubmenuClose"
  >
    <!-- 品牌标 -->
    <button class="dock-brand" title="AI 问答" @click="$emit('open-ai')">
      <span class="dock-brand-mark">
        <svg class="brand-logo" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <radialGradient id="bpDisc" cx="50%" cy="36%" r="78%">
              <stop offset="0%" stop-color="#17457f" />
              <stop offset="54%" stop-color="#0a2450" />
              <stop offset="100%" stop-color="#05122a" />
            </radialGradient>
            <linearGradient id="bpOrbit" x1="0%" y1="18%" x2="100%" y2="82%">
              <stop offset="0%" stop-color="#ffd77a" />
              <stop offset="42%" stop-color="#d8a54c" />
              <stop offset="70%" stop-color="#cfe4ff" />
              <stop offset="100%" stop-color="#ffffff" />
            </linearGradient>
            <linearGradient id="bpChip" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1c579a" />
              <stop offset="100%" stop-color="#0b2a55" />
            </linearGradient>
            <linearGradient id="bpArrow" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#dca747" />
              <stop offset="100%" stop-color="#ffe7ad" />
            </linearGradient>
            <clipPath id="bpClip"><circle cx="32" cy="32" r="29.4" /></clipPath>
          </defs>

          <!-- 深墨圆盘 -->
          <circle cx="32" cy="32" r="30.4" fill="url(#bpDisc)" />
          <circle cx="32" cy="32" r="30.4" fill="none" stroke="rgba(126,182,255,0.34)" stroke-width="0.9" />

          <g clip-path="url(#bpClip)">
            <!-- 经纬网 -->
            <g fill="none" stroke="#4a8ada" stroke-width="0.7" opacity="0.32">
              <ellipse cx="32" cy="32" rx="29" ry="10.5" />
              <ellipse cx="32" cy="32" rx="29" ry="20.5" />
              <ellipse cx="32" cy="32" rx="19" ry="29" />
              <ellipse cx="32" cy="32" rx="9.5" ry="29" />
              <line x1="3" y1="32" x2="61" y2="32" />
              <line x1="32" y1="3" x2="32" y2="61" />
            </g>

            <!-- 底部光穹 -->
            <path d="M9 46 Q32 61 55 46 L55 62 L9 62 Z" fill="#1b6fd0" opacity="0.2" />

            <!-- 鎏金轨道 -->
            <circle cx="32" cy="32" r="24.4" fill="none" stroke="url(#bpOrbit)" stroke-width="1.1" />
            <g fill="#ffe9b8">
              <circle cx="32" cy="7.6" r="1.5" />
              <circle cx="7.6" cy="32" r="1.5" />
              <circle cx="56.4" cy="32" r="1.5" />
              <circle cx="32" cy="56.4" r="1.5" />
            </g>

            <!-- K 线 -->
            <g stroke-width="0.7" opacity="0.88">
              <line x1="17.5" y1="25" x2="17.5" y2="34.5" stroke="#5aa4ff" />
              <line x1="23.5" y1="22" x2="23.5" y2="33" stroke="#ffcf6b" />
              <line x1="29.5" y1="18.5" x2="29.5" y2="30.5" stroke="#5aa4ff" />
              <line x1="35.5" y1="17" x2="35.5" y2="30" stroke="#ffcf6b" />
              <line x1="41.5" y1="14" x2="41.5" y2="27" stroke="#5aa4ff" />
              <line x1="47.5" y1="11.5" x2="47.5" y2="25" stroke="#ffcf6b" />
            </g>
            <g>
              <rect x="16" y="26.5" width="3" height="6" rx="0.6" fill="#4a9bff" />
              <rect x="22" y="23" width="3" height="8" rx="0.6" fill="#ffcf6b" />
              <rect x="28" y="19.5" width="3" height="8.5" rx="0.6" fill="#4a9bff" />
              <rect x="34" y="20.5" width="3" height="8" rx="0.6" fill="#ffcf6b" />
              <rect x="40" y="16" width="3" height="8.5" rx="0.6" fill="#4a9bff" />
              <rect x="46" y="13.5" width="3" height="9" rx="0.6" fill="#ffcf6b" />
            </g>

            <!-- 上扬箭头 -->
            <path d="M13.5 36.5 L23 29.5 L30 31.5 L40.5 21.5 L46.6 15.8"
                  fill="none" stroke="url(#bpArrow)" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round" />
            <path d="M42.4 14.6 L47.6 14.3 L47.2 19.6"
                  fill="none" stroke="#ffe7ad" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round" />

            <!-- A1 芯片 -->
            <g stroke="#63b0ff" stroke-width="0.9" stroke-linecap="round" opacity="0.9">
              <line x1="25.5" y1="35" x2="25.5" y2="31.5" />
              <line x1="32" y1="35" x2="32" y2="31.5" />
              <line x1="38.5" y1="35" x2="38.5" y2="31.5" />
              <line x1="25.5" y1="53" x2="25.5" y2="56.5" />
              <line x1="32" y1="53" x2="32" y2="56.5" />
              <line x1="38.5" y1="53" x2="38.5" y2="56.5" />
              <line x1="22" y1="39.5" x2="18.5" y2="39.5" />
              <line x1="22" y1="44" x2="18.5" y2="44" />
              <line x1="22" y1="48.5" x2="18.5" y2="48.5" />
              <line x1="42" y1="39.5" x2="45.5" y2="39.5" />
              <line x1="42" y1="44" x2="45.5" y2="44" />
              <line x1="42" y1="48.5" x2="45.5" y2="48.5" />
            </g>
            <rect x="22" y="35" width="20" height="18" rx="3"
                  fill="url(#bpChip)" stroke="#63b0ff" stroke-width="1.1" />
            <text x="32" y="47.7" text-anchor="middle" font-size="9.6" font-weight="700"
                  font-family="'Segoe UI', system-ui, sans-serif" fill="#eaf5ff">A1</text>

            <!-- 电路节点 -->
            <g fill="none" stroke="#63b0ff" stroke-width="0.8" opacity="0.72">
              <path d="M18.5 39.5 L15 39.5 L13.6 36.2" />
              <path d="M45.5 48.5 L49 48.5 L50.4 51.2" />
            </g>
            <g fill="#9fd2ff">
              <circle cx="13.6" cy="35.2" r="1.3" />
              <circle cx="50.5" cy="51.8" r="1.3" />
            </g>
          </g>
        </svg>
      </span>
      <span class="dock-label dock-label--brand">智能投研</span>
    </button>

    <!-- 导航项 -->
    <div ref="navRef" class="dock-nav">
      <span class="dock-indicator" :style="indicatorStyle"></span>

      <template v-for="item in navItems" :key="item.key">
        <span v-if="item.type === 'sep'" class="dock-sep">
          <i></i><em>{{ item.label }}</em>
        </span>
        <button
          v-else
          :ref="el => setItemRef(el, item.id)"
          class="dock-item"
          :class="{ 'is-active': currentBoard === item.id, 'is-hover': item.id === 'stock' && subOpen }"
          :style="{ '--accent': item.accent }"
          :title="item.label"
          @click="$emit('switch-board', item.id)"
          @mouseenter="item.id === 'stock' ? openSubmenu($event) : undefined"
        >
          <component :is="item.icon" class="dock-icon" :stroke-width="1.9" />
          <span class="dock-label">{{ item.label }}</span>
        </button>
      </template>
    </div>

    <!-- 股票子菜单：悬浮后从右侧弹出（teleport 到 body，不挤压 dock 布局） -->
    <Teleport to="body">
      <div
        v-if="subOpen"
        class="dock-popover"
        :style="subStyle"
        @mouseenter="cancelSubmenuClose"
        @mouseleave="queueSubmenuClose"
      >
        <button class="dock-popitem" :class="{ 'is-active': currentBoard === 'daily-analysis' }" @click.stop="$emit('open-page', 'daily-analysis'); closeSubmenu()">每日分析</button>
        <button class="dock-popitem" :class="{ 'is-active': currentBoard === 'newstock-calendar' }" @click.stop="$emit('open-page', 'newstock-calendar'); closeSubmenu()">打新日历</button>
      </div>
    </Teleport>

    <!-- 设置 -->
    <button class="dock-item dock-item--foot" title="设置" aria-label="设置" @click="$emit('open-settings')">
      <Cog class="dock-icon" :stroke-width="1.9" />
      <span class="dock-label">设置</span>
    </button>
  </nav>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  LayoutGrid, TrendingUp, Coins, PiggyBank, Gift, NotebookPen, Wrench,
  MessageSquare, FlaskConical, Layers, Sparkles, Palette, GraduationCap, Compass, Cog
} from 'lucide-vue-next'

const props = defineProps({
  currentBoard: {
    type: String,
    default: 'stock'
  }
})

defineEmits(['switch-board', 'open-settings', 'open-page', 'open-ai'])

const navItems = [
  { key: 'g1', type: 'sep', label: '核心' },
  { key: 'overview', id: 'overview', label: '资产总览', icon: LayoutGrid, accent: '#6366f1' },
  { key: 'stock', id: 'stock', label: '股票', icon: TrendingUp, accent: '#2563eb' },
  { key: 'gold', id: 'gold', label: '黄金', icon: Coins, accent: '#d97706' },
  { key: 'deposit', id: 'deposit', label: '存款', icon: PiggyBank, accent: '#059669' },
  { key: 'g2', type: 'sep', label: '记录' },
  { key: 'wool', id: 'wool', label: '薅羊毛', icon: Gift, accent: '#db2777' },
  { key: 'note', id: 'note', label: '笔记', icon: NotebookPen, accent: '#7c3aed' },
  { key: 'tool', id: 'tool', label: '小工具', icon: Wrench, accent: '#475569' },
  { key: 'g3', type: 'sep', label: '智能' },
  { key: 'wechat', id: 'wechat', label: '微信选股提取', icon: MessageSquare, accent: '#059669' },
  { key: 'quant', id: 'quant', label: '策略回测', icon: FlaskConical, accent: '#4f46e5' },
  { key: 'quant-grid', id: 'quant-grid', label: '批量回测', icon: Layers, accent: '#7c3aed' },
  { key: 'ai', id: 'ai', label: 'AI 创作工作台', icon: Sparkles, accent: '#6366f1' },
  { key: 'ai-canvas', id: 'ai-canvas', label: 'AI 画布', icon: Palette, accent: '#ec4899' },
  { key: 'quiz', id: 'quiz', label: 'AI 题目问答', icon: GraduationCap, accent: '#8b5cf6' },
  { key: 'g4', type: 'sep', label: '人生' },
  { key: 'life', id: 'life', label: '人生规划器', icon: Compass, accent: '#6366f1' }
]

const navRef = ref(null)
const itemEls = {}
const indicatorY = ref(0)
const indicatorH = ref(36)

const indicatorStyle = computed(() => ({
  transform: `translateY(${indicatorY.value}px)`,
  height: `${indicatorH.value}px`
}))

function setItemRef(el, id) {
  if (el) itemEls[id] = el
}

function syncIndicator() {
  const nav = navRef.value
  const el = itemEls[props.currentBoard]
  if (!nav || !el) return
  indicatorY.value = el.offsetTop
  indicatorH.value = el.offsetHeight

  const top = el.offsetTop
  const bottom = top + el.offsetHeight
  if (top < nav.scrollTop || bottom > nav.scrollTop + nav.clientHeight) {
    nav.scrollTo({ top: top - nav.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' })
  }
}

watch(() => props.currentBoard, () => nextTick(syncIndicator))

// 股票子菜单：悬浮锚点后从右侧弹出（teleport 到 body，不挤压 dock）
const subOpen = ref(false)
const subStyle = ref({})
const railRef = ref(null)
let subCloseTimer = null
// 与 .dock-rail:hover 展开后的宽度保持一致，用于把二级菜单放到 Dock 右侧之外
const RAIL_EXPANDED_WIDTH = 178
// 鼠标穿过一级/二级菜单之间的间隙时的容错时间
const SUBMENU_CLOSE_DELAY = 320

function openSubmenu(e) {
  const item = e.currentTarget
  const rail = railRef.value
  if (!item || !rail) return
  const itemRect = item.getBoundingClientRect()
  const railRect = rail.getBoundingClientRect()
  // 二级菜单必须落在一级 Dock「展开后」的右边缘之外：若盖在 Dock 上，
  // 指针会直接落在刚出现的浮层里而触发不了 mouseenter，浮层随即被误关闭导致点不到。
  const left = Math.min(railRect.left + RAIL_EXPANDED_WIDTH + 10, Math.max(12, window.innerWidth - 164))
  const top = Math.min(Math.max(itemRect.top - 10, 12), Math.max(12, window.innerHeight - 120))
  subStyle.value = { left: `${left}px`, top: `${top}px` }
  cancelSubmenuClose()
  subOpen.value = true
}
function queueSubmenuClose() {
  clearTimeout(subCloseTimer)
  subCloseTimer = setTimeout(() => { subOpen.value = false }, SUBMENU_CLOSE_DELAY)
}
function cancelSubmenuClose() { clearTimeout(subCloseTimer) }
function closeSubmenu() {
  clearTimeout(subCloseTimer)
  subOpen.value = false
}

onMounted(() => {
  nextTick(syncIndicator)
  window.addEventListener('resize', syncIndicator)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncIndicator)
  clearTimeout(subCloseTimer)
})
</script>

<style scoped>
/* ---------- 竖向 Dock：收起为图标条，悬停横向展开 ---------- */
.dock-rail {
  position: fixed;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 45;
  width: 48px;
  max-height: calc(100vh - 20px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px 6px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.88));
  /* 去掉外投影，避免悬浮感；仅保留内侧高光 */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(18px) saturate(1.35);
  overflow: hidden;
  /* 只靠 hover 展开，鼠标离开自动收起；不使用 focus-within，避免点击后一直展开 */
  transition: width 0.34s cubic-bezier(0.4, 0, 0.2, 1), background 0.35s ease, border-color 0.35s ease;
}
.dock-rail:hover,
.dock-rail.is-sub-open {
  width: 178px;
}

/* 品牌标 */
.dock-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  flex-shrink: 0;
  padding: 0;
  border-radius: 13px;
}
.dock-brand-mark {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  box-shadow: 0 6px 16px rgba(8, 26, 58, 0.34);
  transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.brand-logo {
  display: block;
  width: 100%;
  height: 100%;
}
.dock-brand:hover .dock-brand-mark { transform: translateY(-2px) scale(1.06); }
.dock-label--brand {
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* 导航容器 */
.dock-nav {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  padding: 2px 0;
}
.dock-nav::-webkit-scrollbar { width: 0; height: 0; }

/* 滑动指示条 */
.dock-indicator {
  position: absolute;
  left: 0;
  top: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #6366f1, #22d3ee);
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.75);
  transition: transform 0.34s cubic-bezier(0.34, 1.4, 0.64, 1), height 0.28s ease;
  pointer-events: none;
}

/* 分组分隔 */
.dock-sep {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 12px;
  margin: 3px 0;
  flex-shrink: 0;
  padding: 0 8px;
}
.dock-sep i {
  width: 18px;
  height: 1px;
  flex-shrink: 0;
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.6), transparent);
}
.dock-sep em {
  font-style: normal;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: #b6c0cd;
  opacity: 0;
  white-space: nowrap;
  transition: opacity 0.2s ease;
}
.dock-rail:hover .dock-sep em,
.dock-rail.is-sub-open .dock-sep em { opacity: 1; }

/* 导航项 */
.dock-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  flex-shrink: 0;
  padding: 0 8px;
  border-radius: 12px;
  color: #64748b;
  white-space: nowrap;
  transition: color 0.2s, background 0.2s;
}
.dock-item:hover {
  color: #0f172a;
  background: rgba(148, 163, 184, 0.16);
}
.dock-item:hover .dock-icon { color: var(--accent, #0f172a); }
.dock-item.is-active {
  color: var(--accent, #2563eb);
  background: color-mix(in srgb, var(--accent, #2563eb) 13%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent, #2563eb) 26%, transparent);
}
/* 悬浮二级菜单时，一级「股票」保持高亮展示 */
.dock-item.is-hover {
  color: var(--accent, #2563eb);
  background: color-mix(in srgb, var(--accent, #2563eb) 13%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent, #2563eb) 26%, transparent);
}
.dock-item.is-hover .dock-icon {
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent, #2563eb) 55%, transparent));
}

.dock-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  transition: color 0.2s;
}

/* 文字标签（收起时隐藏，展开时淡入） */
.dock-label {
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  opacity: 0;
  transition: opacity 0.22s ease 0.04s;
}
.dock-rail:hover .dock-label,
.dock-rail.is-sub-open .dock-label { opacity: 1; }

/* 底部设置 */
.dock-item--foot { margin-top: 2px; }

/* 股票子菜单浮层：teleport 到 body，从 dock 右侧弹出 */
.dock-popover {
  position: fixed;
  z-index: 60;
  min-width: 132px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.94));
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(18px) saturate(1.35);
  animation: dock-pop-in 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: left center;
}
@keyframes dock-pop-in {
  from { opacity: 0; transform: translateX(-8px) scale(0.96); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
/* 悬浮桥：填补一级菜单与二级菜单之间的空隙，
   鼠标经过或停留在间隙时仍算作悬浮在子菜单上，不会误触发关闭 */
.dock-popover::before {
  content: '';
  position: absolute;
  top: -8px;
  bottom: -8px;
  left: -16px;
  width: 16px;
}
.dock-popitem {
  display: block;
  width: 100%;
  min-height: 32px;
  padding: 5px 12px 5px 14px;
  border-radius: 9px;
  color: #64748b;
  font-size: 12px;
  line-height: 22px;
  text-align: left;
  white-space: nowrap;
  transition: color .2s, background .2s, transform .2s;
}
.dock-popitem:hover { color: #2563eb; background: rgba(59, 130, 246, .08); transform: translateX(2px); }
.dock-popitem.is-active { color: #2563eb; font-weight: 600; background: rgba(59, 130, 246, .1); }

@media (max-height: 760px) {
  .dock-item { height: 32px; }
  .dock-brand, .dock-brand-mark { height: 34px; }
  .dock-brand-mark { width: 34px; height: 34px; }
  .dock-sep { margin: 1px 0; height: 8px; }
}

@media (max-width: 1100px) {
  .dock-rail { left: 6px; }
  .dock-rail:hover { width: 176px; }
}
</style>
