<template>
  <div class="ev-box">
    <div class="ev-head">
      <CalendarClock :stroke-width="1.8" />
      <b>事件倒计时</b>
      <span class="ev-sub">{{ activeCount ? `进行中 ${activeCount}` : '' }}</span>
    </div>

    <div class="ev-list">
      <p v-if="!sorted.length" class="ev-empty">暂无事件，添加一个开始倒计时</p>
      <div v-for="ev in sorted" :key="ev.id" class="ev-row" :class="ev.tone">
        <span class="ev-name" :title="ev.name">{{ ev.name }}</span>
        <span class="ev-date">{{ ev.date.slice(5).replace('-', '/') }}</span>
        <span class="ev-badge">{{ ev.text }}</span>
        <button class="ev-del" title="删除事件" @click="remove(ev.id)">×</button>
      </div>
    </div>

    <form class="ev-add" @submit.prevent="add">
      <input v-model.trim="name" placeholder="事件名称" maxlength="20" />
      <input v-model="date" type="date" required />
      <button type="submit" title="添加事件">＋</button>
    </form>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CalendarClock } from 'lucide-vue-next'
import { storage } from '../utils/storage'

const KEY = 'eventCountdown'
const dayKey = (value = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
const today = ref(dayKey())
const events = ref(normalize(storage.get(KEY, [])))
const name = ref('')
const date = ref(today.value)
let timer

function normalize(list) {
  return (Array.isArray(list) ? list : [])
    .filter(item => item && typeof item.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date || ''))
    .map(item => ({ id: item.id || newId(), name: item.name.slice(0, 20), date: item.date }))
}
function newId() { return `${Date.now()}${Math.random().toString(36).slice(2, 7)}` }
function diffDays(target) {
  return Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today.value}T00:00:00Z`)) / 86400000)
}

const sorted = computed(() =>
  [...events.value]
    .map(ev => {
      const days = diffDays(ev.date)
      const text = days > 0 ? `还有 ${days} 天` : days === 0 ? '就是今天' : `已过 ${-days} 天`
      const tone = days < 0 ? 'is-past' : days <= 1 ? 'is-now' : days <= 3 ? 'is-soon' : 'is-future'
      return { ...ev, days, text, tone }
    })
    .sort((a, b) => (a.days < 0 ? 1 : 0) - (b.days < 0 ? 1 : 0) || a.days - b.days)
)
const activeCount = computed(() => sorted.value.filter(ev => ev.days >= 0).length)

function persist() {
  storage.set(KEY, events.value.map(({ id, name: label, date: day }) => ({ id, name: label, date: day })))
}
function add() {
  if (!name.value || !/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return
  events.value.push({ id: newId(), name: name.value.slice(0, 20), date: date.value })
  name.value = ''
  date.value = today.value
  persist()
}
function remove(id) { events.value = events.value.filter(ev => ev.id !== id); persist() }

function syncFromStorage(event) {
  if (event?.key && !event.key.endsWith(KEY)) return
  events.value = normalize(storage.get(KEY, []))
}

onMounted(() => {
  timer = setInterval(() => { const key = dayKey(); if (key !== today.value) today.value = key }, 60000)
  window.addEventListener('storage', syncFromStorage)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('storage', syncFromStorage)
})
</script>

<style scoped>
.ev-box{border:1px solid #e2e9f1;border-radius:12px;padding:9px 11px;background:linear-gradient(135deg,#f8fbfd,#eef4f9);margin-bottom:11px}
.ev-head{display:flex;align-items:center;gap:6px;color:#5b7691}
.ev-head svg{width:14px;height:14px;color:#7d94ad}
.ev-head b{font-size:11px;font-weight:700;letter-spacing:.02em}
.ev-sub{margin-left:auto;font-size:9px;color:#9aa9b9}
.ev-list{display:flex;flex-direction:column;gap:4px;max-height:104px;overflow:auto;margin-top:7px}
.ev-empty{font-size:10px;color:#9aa8b7;padding:6px 0;text-align:center}
.ev-row{display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:7px;background:#fff;border:1px solid #edf1f6}
.ev-name{flex:1;min-width:0;font-size:11px;color:#415a75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev-date{font-size:9px;color:#9aa9b9;font-variant-numeric:tabular-nums}
.ev-badge{font-size:10px;font-weight:600;padding:2px 6px;border-radius:5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.ev-row.is-future .ev-badge{background:#e6efee;color:#5f8f81}
.ev-row.is-soon .ev-badge{background:#f7ecd8;color:#a8812f}
.ev-row.is-now .ev-badge{background:#f8e3e1;color:#b3564f}
.ev-row.is-past{opacity:.55}
.ev-row.is-past .ev-badge{background:#eef1f4;color:#93a1b0}
.ev-del{font-size:13px;line-height:1;color:#b3c0cd;padding:0 2px}
.ev-del:hover{color:#bd6966}
.ev-add{display:flex;gap:5px;margin-top:7px}
.ev-add input{min-width:0;padding:5px 7px;border:1px solid #dbe4ee;border-radius:7px;font-size:10px;color:#415a75;background:#fff}
.ev-add input:first-child{flex:1}
.ev-add input[type=date]{width:116px}
.ev-add button{flex:none;width:27px;border-radius:7px;background:#6087b0;color:#fff;font-size:13px;line-height:1}
</style>
