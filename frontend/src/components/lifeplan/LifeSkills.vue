<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <p class="text-xs text-slate-400">按 7 类梳理个人档案（基础信息 / 已掌握 / 待学习 / 证书 / 爱好 / 短板 / 偏好约束）· AI 自动维护，点卡片就地编辑</p>
      <button v-if="loading || busy" class="text-[11px] text-slate-400 flex items-center gap-1.5">
        <Loader2 class="w-3.5 h-3.5 animate-spin" /> 处理中…
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div v-for="column in CATEGORIES" :key="column.key" class="rounded-xl border border-slate-100 bg-white p-3 flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold" :class="column.accent">{{ column.label }}</span>
          <span class="text-[11px] text-slate-400">{{ skillsFor(column.key).length }}</span>
        </div>

        <p v-if="loading" class="px-1 py-4 text-center text-[11px] text-slate-400">加载中…</p>
        <p v-else-if="!skillsFor(column.key).length && editingKey !== 'new-' + column.key" class="px-1 py-4 text-center text-[11px] text-slate-400">
          还没有记录，点下方新增
        </p>

        <div class="space-y-2">
          <div
            v-for="skill in skillsFor(column.key)"
            :key="skill.id"
            class="rounded-lg border px-2.5 py-2 transition-colors"
            :class="editingKey === 'edit-' + skill.id ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100 bg-white hover:bg-slate-50/70'"
            @click="startEdit(skill)"
          >
            <div v-if="editingKey === 'edit-' + skill.id" class="space-y-2" @click.stop>
              <input v-model.trim="form.name" class="h-8 w-full" :class="INPUT" placeholder="条目名称" @keydown.enter="saveEdit" />
              <div class="flex items-center gap-2">
                <input v-model.trim="form.level" class="h-8 flex-1" :class="INPUT" placeholder="水平 / 状态（如 熟练 / 待考 / 入门）" @keydown.enter="saveEdit" />
                <select v-model="form.category" class="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 outline-none focus:border-indigo-300">
                  <option v-for="item in CATEGORIES" :key="item.key" :value="item.key">{{ item.label }}</option>
                </select>
              </div>
              <input v-model.trim="form.note" class="h-8 w-full" :class="INPUT" placeholder="备注" @keydown.enter="saveEdit" />
              <div class="flex items-center justify-between gap-2">
                <button class="text-[11px] text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1" @click.stop="remove(skill)">
                  <Trash2 class="w-3.5 h-3.5" /> 删除
                </button>
                <div class="flex items-center gap-2">
                  <button class="h-7 px-2.5 rounded-lg bg-white border border-slate-200 text-slate-500 text-[11px] hover:border-slate-300 transition-colors" @click.stop="editingKey = ''">取消</button>
                  <button class="h-7 px-2.5 rounded-lg bg-indigo-500 text-white text-[11px] font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50" :disabled="busy" @click.stop="saveEdit">保存</button>
                </div>
              </div>
            </div>

            <div v-else>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-medium text-slate-700">{{ skill.name }}</span>
                <span v-if="skill.level" class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{{ skill.level }}</span>
              </div>
              <p v-if="skill.note" class="mt-1 text-[11px] text-slate-400">{{ skill.note }}</p>
            </div>
          </div>

          <!-- 新增草稿 -->
          <div v-if="editingKey === 'new-' + column.key" class="rounded-lg border border-indigo-200 bg-indigo-50/30 px-2.5 py-2 space-y-2">
            <input v-model.trim="form.name" class="h-8 w-full" :class="INPUT" placeholder="条目名称" @keydown.enter="saveCreate" />
            <div class="flex items-center gap-2">
              <input v-model.trim="form.level" class="h-8 flex-1" :class="INPUT" placeholder="水平 / 状态" @keydown.enter="saveCreate" />
              <select v-model="form.category" class="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 outline-none focus:border-indigo-300">
                <option v-for="item in CATEGORIES" :key="item.key" :value="item.key">{{ item.label }}</option>
              </select>
            </div>
            <input v-model.trim="form.note" class="h-8 w-full" :class="INPUT" placeholder="备注" @keydown.enter="saveCreate" />
            <div class="flex items-center justify-end gap-2">
              <button class="h-7 px-2.5 rounded-lg bg-white border border-slate-200 text-slate-500 text-[11px] hover:border-slate-300 transition-colors" @click="editingKey = ''">取消</button>
              <button class="h-7 px-2.5 rounded-lg bg-indigo-500 text-white text-[11px] font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50" :disabled="busy || !form.name.trim()" @click="saveCreate">保存</button>
            </div>
          </div>
        </div>

        <button
          class="mt-auto h-8 rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1"
          @click="startCreate(column.key)"
        >
          <Plus class="w-3.5 h-3.5" /> 新增
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { Loader2, Plus, Trash2 } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })
const emit = defineEmits(['changed'])

const INPUT = 'rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition-colors focus:border-indigo-300'
const CATEGORIES = [
  { key: 'info', label: '基础信息', accent: 'text-slate-600' },
  { key: 'own', label: '已掌握技能', accent: 'text-emerald-600' },
  { key: 'learn', label: '待学习技能', accent: 'text-indigo-600' },
  { key: 'cert', label: '证书资质', accent: 'text-amber-600' },
  { key: 'hobby', label: '爱好特长', accent: 'text-sky-600' },
  { key: 'weak', label: '短板风险', accent: 'text-rose-600' },
  { key: 'pref', label: '偏好与约束', accent: 'text-violet-600' }
]

const skills = ref([])
const loading = ref(true)
const busy = ref(false)
const editingKey = ref('')
const form = reactive({ name: '', level: '', note: '', category: 'own' })

function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}

function skillsFor(category) {
  return skills.value
    .filter(item => item.category === category)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0))
}

async function load() {
  loading.value = true
  try {
    const result = await lifeApi.getSkills()
    skills.value = result.skills || []
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

function startEdit(skill) {
  if (editingKey.value === 'edit-' + skill.id) return
  editingKey.value = 'edit-' + skill.id
  Object.assign(form, {
    name: skill.name || '',
    level: skill.level || '',
    note: skill.note || '',
    category: skill.category || 'own'
  })
}

function startCreate(category) {
  editingKey.value = 'new-' + category
  Object.assign(form, { name: '', level: '', note: '', category })
}

async function saveEdit() {
  const id = editingKey.value.replace('edit-', '')
  if (busy.value || !form.name.trim()) return
  busy.value = true
  try {
    const result = await lifeApi.updateSkill(id, {
      name: form.name.trim(),
      level: form.level.trim(),
      note: form.note.trim(),
      category: form.category
    })
    skills.value = result.skills || []
    editingKey.value = ''
    emit('changed')
    toast.success('技能已更新')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function saveCreate() {
  if (busy.value || !form.name.trim()) return
  busy.value = true
  try {
    const result = await lifeApi.createSkill({
      name: form.name.trim(),
      level: form.level.trim(),
      note: form.note.trim(),
      category: form.category
    })
    skills.value = result.skills || []
    editingKey.value = ''
    emit('changed')
    toast.success('技能已新增')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function remove(skill) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.deleteSkill(skill.id)
    skills.value = result.skills || []
    editingKey.value = ''
    emit('changed')
    toast.success('技能已删除')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
