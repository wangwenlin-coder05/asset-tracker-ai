<template>
  <div class="space-y-2">
    <input v-model.trim="form.name" class="h-8 w-full" :class="INPUT" placeholder="路径名称（如 国考县级调查队）" />

    <div class="flex items-center gap-2">
      <span class="text-[10px] text-slate-400">适配得分</span>
      <input v-model.number="form.score" type="number" min="0" max="100" class="h-8 w-20 tabular-nums" :class="INPUT" />
      <span class="min-w-0 text-[10px] text-slate-400">0~100，由画像自动计算，也可手动调整</span>
    </div>

    <p class="text-[10px] font-medium text-slate-400">✅ 个人优势（分号分隔多条）</p>
    <textarea v-model="form.advantages" rows="3" :class="INPUT" class="w-full resize-none py-2 text-[12px] leading-relaxed" placeholder="软件工程科班；有全栈项目与竞赛经历"></textarea>

    <p class="text-[10px] font-medium text-slate-400">⚠️ 劣势 / 代价</p>
    <textarea v-model="form.risks" rows="2" :class="INPUT" class="w-full resize-none py-2 text-[12px] leading-relaxed" placeholder="5 年最低服务期；县城基层需要下乡入户"></textarea>

    <p class="text-[10px] font-medium text-slate-400">📋 前置要求（证书 / 考试 / 学历 / 应届生身份）</p>
    <textarea v-model="form.prerequisites" rows="2" :class="INPUT" class="w-full resize-none py-2 text-[12px] leading-relaxed" placeholder="笔试面试通过；拿到毕业证学位证"></textarea>

    <p class="text-[10px] font-medium text-slate-400">📈 长期推演（能力 / 资产 / 生活变化）</p>
    <textarea v-model="form.evolution" rows="3" :class="INPUT" class="w-full resize-none py-2 text-[12px] leading-relaxed" placeholder="收入稳定 → 逐步积累资金 → 购车 → 后续考虑购房"></textarea>

    <p class="text-[10px] font-medium text-slate-400">🔗 推演子图节点 id（可选，右侧规划网络里的对应根节点）</p>
    <input v-model.trim="form.nodeId" class="h-8 w-full" :class="INPUT" placeholder="留空则「看推演子图」不可点" />

    <div class="flex items-center justify-end gap-2 pt-1">
      <button class="h-7 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-500 transition-colors hover:border-slate-300" @click="emit('cancel')">取消</button>
      <button
        class="h-7 rounded-lg bg-indigo-500 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        :disabled="busy || !form.name.trim()"
        @click="emit('save')"
      >保存</button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, required: true },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['cancel', 'save'])

const INPUT = 'rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition-colors focus:border-indigo-300'

// 直接改父级传入的草稿对象：新增与编辑共用同一份表单状态
const form = props.modelValue
</script>
