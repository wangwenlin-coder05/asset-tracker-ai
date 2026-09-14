<template>
  <div class="aiwork-root w-full min-h-[calc(100vh-175px)] flex flex-col lg:flex-row gap-3 px-2 sm:px-3">
    <!-- ===== 左侧导航 ===== -->
    <aside class="aiwork-side w-full lg:w-60 xl:w-64 flex-shrink-0">
      <div class="aiwork-side__inner bg-white rounded-xl card-shadow p-3 lg:sticky lg:top-3 lg:max-h-[calc(100vh-185px)] overflow-y-auto">
        <div class="flex items-center gap-2 mb-4 px-2">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-200/60">
            <Sparkles class="w-5 h-5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold text-slate-800 leading-tight">AI 创作工作台</div>
            <div class="text-[11px] text-slate-400 mt-0.5">免写提示词 · 一键出稿</div>
          </div>
        </div>

        <nav class="space-y-1">
          <button
            v-for="m in menuItems"
            :key="m.key"
            @click="currentMenu = m.key"
            class="aiwork-nav w-full group flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150"
            :class="currentMenu === m.key
              ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-200/50'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'"
          >
            <span class="aiwork-nav__icon w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              :class="currentMenu === m.key ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500'">
              <component :is="iconMap[m.icon]" class="w-4 h-4" />
            </span>
            <span class="flex-1 min-w-0">
              <span class="text-sm font-medium block leading-tight">{{ m.name }}</span>
              <span class="text-[11px] block leading-tight mt-0.5 opacity-80"
                :class="currentMenu === m.key ? 'text-white/80' : 'text-slate-400'">
                {{ m.desc }}
              </span>
            </span>
          </button>
        </nav>

        <div class="mt-5 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-100">
          <div class="flex items-center gap-2 text-amber-700 mb-2">
            <AlertCircle class="w-4 h-4" />
            <span class="text-xs font-semibold">版权提醒</span>
          </div>
          <p class="text-[11px] leading-relaxed text-amber-800/80">
            免费接口仅返回热点标题和原文链接；
            解析正文只用于<strong>选题参考结构</strong>，直接搬运全文用于发布可能构成侵权。
          </p>
        </div>
      </div>
    </aside>

    <!-- ===== 右侧内容 ===== -->
    <main class="flex-1 min-w-0">
      <!-- Dashboard -->
      <AiDash v-if="currentMenu === 'dashboard'" @go="currentMenu = $event" />
      <!-- 热点选题 -->
      <AiHot v-else-if="currentMenu === 'hot'" />
      <!-- 文章生成 -->
      <AiArticle v-else-if="currentMenu === 'article'" />
      <!-- 标题生成 -->
      <AiTitle v-else-if="currentMenu === 'title'" />
      <!-- 链接生成 -->
      <AiLink v-else-if="currentMenu === 'link'" />
      <!-- 素材合成 -->
      <AiMaterial v-else-if="currentMenu === 'material'" />
      <!-- 文章库 -->
      <AiLibrary v-else-if="currentMenu === 'library'" />
    </main>
  </div>
</template>

<script setup>
import { ref, provide, onMounted } from 'vue'
import {
  Sparkles, AlertCircle, LayoutDashboard, Flame, FileText, Hash, Link, Layers, LibraryBig
} from 'lucide-vue-next'
import { useAiWork } from '../composables/useAiWork'
import AiDash from './ai/AiDash.vue'
import AiHot from './ai/AiHot.vue'
import AiArticle from './ai/AiArticle.vue'
import AiTitle from './ai/AiTitle.vue'
import AiLink from './ai/AiLink.vue'
import AiMaterial from './ai/AiMaterial.vue'
import AiLibrary from './ai/AiLibrary.vue'

const { menuItems, loadPlatforms } = useAiWork()

const iconMap = {
  LayoutDashboard, Flame, FileText, Hash, Link, Layers, LibraryBig,
}

const currentMenu = ref('dashboard')

provide('aiSwitchMenu', (k) => { currentMenu.value = k })

onMounted(() => {
  loadPlatforms()
})
</script>

<style scoped>
.aiwork-side__inner::-webkit-scrollbar { width: 4px; height: 4px; }
.aiwork-side__inner::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
.aiwork-nav {
  will-change: transform;
  transform: translateZ(0);
}
.aiwork-nav:hover { transform: translateX(1px); }
</style>
