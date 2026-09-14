import { ref } from 'vue'
import { aiWorkApi } from '../utils/api'

// 热点平台（带本地缓存）
const platforms = ref([])
const platformsLoaded = ref(false)

// 侧边栏功能菜单
const menuItems = [
  { key: 'dashboard',  name: '工作台',   icon: 'LayoutDashboard', desc: '统计概览 + 最近生成' },
  { key: 'hot',        name: '热点选题', icon: 'Flame',           desc: '10+平台热榜 实时聚合' },
  { key: 'article',    name: '文章生成', icon: 'FileText',        desc: '选风格 / 模型 一键出稿' },
  { key: 'title',      name: '标题生成', icon: 'Hash',            desc: '关键词 → 爆款标题方案' },
  { key: 'link',       name: '链接生成', icon: 'Link',            desc: '推广 / 分享 / 短链' },
  { key: 'material',   name: '素材合成', icon: 'Layers',          desc: '图文拼版 + 预览导出' },
  { key: 'library',    name: '文章库',   icon: 'LibraryBig',      desc: '历史记录 / 筛选 / 再编辑' },
]

export function useAiWork() {
  async function loadPlatforms(force = false) {
    if (platformsLoaded.value && !force) return platforms.value
    try {
      const r = await aiWorkApi.getHotPlatforms()
      platforms.value = r?.data || []
      platformsLoaded.value = true
    } catch (e) {
      console.warn('[useAiWork] loadPlatforms failed', e.message)
    }
    return platforms.value
  }

  // 统一样式配置
  const styleConfig = {
    primary: '#2563EB',
    accent:  '#10B981',
    warm:    '#F59E0B',
    danger:  '#EF4444',
    categories: [
      { key: '综合', color: 'bg-slate-50 text-slate-600 border-slate-200' },
      { key: '科技', color: 'bg-blue-50  text-blue-600  border-blue-200' },
      { key: '财经', color: 'bg-rose-50  text-rose-600  border-rose-200' },
      { key: '社会', color: 'bg-amber-50 text-amber-700 border-amber-200' },
      { key: '娱乐', color: 'bg-pink-50  text-pink-600  border-pink-200' },
      { key: '体育', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      { key: '时政', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    ],
  }
  function getCategoryStyle(cat) {
    return styleConfig.categories.find(c => c.key === cat)?.color || styleConfig.categories[0].color
  }

  // 文章风格
  const articleStyles = [
    { key: 'informal', name: '轻松口语', desc: '像朋友聊天一样' },
    { key: 'formal',   name: '深度观点', desc: '有理有据的深度分析' },
    { key: 'news',     name: '资讯快报', desc: '简洁直接，信息优先' },
    { key: 'narrative',name: '故事叙述', desc: '情节化、有吸引力' },
    { key: 'marketing',name: '营销种草', desc: '突出卖点，引导转化' },
    { key: 'academic', name: '科普教程', desc: '系统完整、逻辑清晰' },
  ]

  // 文章长度
  const articleLengths = [
    { key: 'short',  name: '短篇',  words: '300~500' },
    { key: 'middle', name: '中篇',  words: '800~1200' },
    { key: 'long',   name: '长篇',  words: '1500~2000' },
    { key: 'huge',   name: '深度',  words: '2500+' },
  ]

  // 发布平台
  const publishPlatforms = [
    { key: 'wxgzh',  name: '微信公众号', icon: 'MessageSquare' },
    { key: 'xhs',    name: '小红书',     icon: 'BookOpenCheck' },
    { key: 'douyin', name: '抖音',       icon: 'Music2' },
    { key: 'weibo',  name: '微博',       icon: 'Feather' },
    { key: 'toutiao',name: '头条号',     icon: 'Newspaper' },
    { key: 'zhihu',  name: '知乎',       icon: 'HelpCircle' },
    { key: 'bilibili', name: 'B站',      icon: 'MonitorPlay' },
    { key: 'other',  name: '通用',       icon: 'Globe' },
  ]

  // 简易字数统计（中文去空白）
  function countWords(text) {
    return String(text || '').replace(/\s/g, '').length
  }

  // 复制到剪贴板
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        return true
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  return {
    // 菜单
    menuItems,
    // 平台
    platforms,
    platformsLoaded,
    loadPlatforms,
    // 样式
    styleConfig,
    getCategoryStyle,
    articleStyles,
    articleLengths,
    publishPlatforms,
    // 工具
    countWords,
    copyToClipboard,
  }
}
