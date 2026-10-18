<template>
  <div class="ai-mask" @click.self="$emit('close')"><section class="ai-box"><header><div><b>AI 问答</b><small>解答投研、账户和使用疑惑</small></div><button @click="$emit('close')">×</button></header><div class="ai-messages"><div v-for="(item,index) in messages" :key="index" class="ai-message" :class="item.role">{{ item.content }}</div><div v-if="busy" class="ai-message assistant">正在思考…</div></div><form @submit.prevent="ask"><textarea v-model="question" rows="3" placeholder="例如：什么是做T？为什么需要设置止损价？" :disabled="busy"></textarea><button :disabled="busy || !question.trim()">{{ busy ? '回答中…' : '发送' }}</button></form></section></div>
</template>
<script setup>
import { ref, onMounted, watch } from 'vue'
defineEmits(['close'])
const storageKey = 'stock-calculator-ai-assistant-history'
const question = ref(''); const busy = ref(false); const messages = ref([])
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
    messages.value = Array.isArray(saved) && saved.length ? saved : [{ role: 'assistant', content: '你好，我可以解释页面功能、投研术语和操作思路，但不构成投资建议。' }]
  } catch (_) {
    messages.value = [{ role: 'assistant', content: '你好，我可以解释页面功能、投研术语和操作思路，但不构成投资建议。' }]
  }
})
watch(messages, value => localStorage.setItem(storageKey, JSON.stringify(value.slice(-100))), { deep: true })
async function ask() { const text = question.value.trim(); if (!text || busy.value) return; messages.value.push({ role: 'user', content: text }); question.value = ''; busy.value = true; try { const response = await fetch('/api/ai/ask', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ question:text }) }); const data = await response.json(); messages.value.push({ role:'assistant', content:data.answer || data.error || '暂时无法回答' }) } catch (error) { messages.value.push({ role:'assistant', content:error.message }) } finally { busy.value = false } }
</script>
<style scoped>
.ai-mask{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:#07122599}.ai-box{width:min(680px,100%);height:min(680px,90vh);display:flex;flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 24px 80px #07122555}.ai-box header{display:flex;justify-content:space-between;padding:20px;border-bottom:1px solid #e5eaf2}.ai-box header b{display:block;font-size:18px;color:#17253d}.ai-box header small{display:block;margin-top:4px;color:#94a3b8}.ai-box header button{font-size:24px;color:#94a3b8}.ai-messages{flex:1;overflow:auto;padding:20px}.ai-message{max-width:85%;margin:0 0 12px;padding:10px 13px;border-radius:12px;white-space:pre-wrap;line-height:1.7}.ai-message.user{margin-left:auto;background:#2563eb;color:#fff}.ai-message.assistant{background:#f1f5f9;color:#334155}.ai-box form{display:flex;gap:10px;padding:16px;border-top:1px solid #e5eaf2}.ai-box textarea{flex:1;resize:none;border:1px solid #dbe5f2;border-radius:10px;padding:10px}.ai-box form button{align-self:flex-end;border-radius:9px;padding:9px 18px;background:#2563eb;color:#fff}.ai-box form button:disabled{opacity:.5}
</style>
