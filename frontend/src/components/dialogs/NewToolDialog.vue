<template>
  <div class="tool-dialog-mask" @pointerdown.self="requestClose">
    <section ref="dialogRef" class="tool-dialog" role="dialog" aria-modal="true" aria-labelledby="tool-dialog-title" tabindex="-1" @pointerdown.stop @click.stop>
      <header class="tool-dialog__header">
        <div>
          <span class="tool-kicker">QUICK LINKS</span>
          <h2 id="tool-dialog-title">{{ item ? '编辑小工具' : '新增小工具' }}</h2>
        </div>
        <button type="button" class="icon-command" title="关闭" :disabled="saving" @click.stop="requestClose"><X /></button>
      </header>

      <div class="tool-dialog__body">
        <div class="form-grid">
          <label class="field full">
            <span>工具名称</span>
            <input v-model.trim="form.name" maxlength="200" placeholder="例如：查名下电话卡" @keydown.enter.stop.prevent="handleConfirm" />
          </label>
          <label class="field">
            <span>分类</span>
            <input v-model.trim="form.category" maxlength="100" placeholder="如：AI工具集" list="category-list" @focus="showCategorySuggestions = true" @blur="hideCategoryDelay" @keydown.enter.stop.prevent="handleConfirm" />
            <div v-if="showCategorySuggestions && catSuggestions.length" class="cat-suggest">
              <button v-for="cat in catSuggestions" :key="cat" type="button" @mousedown.prevent="form.category = cat; showCategorySuggestions = false">{{ cat }}</button>
            </div>
          </label>
          <label class="field">
            <span>排序</span>
            <input v-model.number="form.sortOrder" type="number" min="0" step="1" />
          </label>
          <label class="field">
            <span>图标</span>
            <div class="icon-select">
              <button v-for="icon in iconOptions" :key="icon.name" type="button" :class="{selected: form.icon === icon.name}" @click.stop="form.icon = icon.name" :title="icon.label">
                <component :is="icon.comp" class="w-5 h-5" />
              </button>
            </div>
          </label>
          <label class="field full">
            <span>链接地址</span>
            <input v-model.trim="form.url" maxlength="1000" placeholder="https://..." @keydown.enter.stop.prevent="handleConfirm" />
          </label>
          <label class="field full">
            <span>备注</span>
            <textarea v-model.trim="form.note" maxlength="500" rows="3" placeholder="工具说明、使用技巧等"></textarea>
          </label>
        </div>
      </div>

      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
      <footer class="tool-dialog__footer">
        <span>小工具是常用网站的快捷入口，点击即可在新标签页打开。</span>
        <div>
          <button type="button" class="secondary-command" :disabled="saving" @click.stop="requestClose">取消</button>
          <button type="button" class="primary-command" :disabled="saving || !canSave" @click.stop="handleConfirm">
            <LoaderCircle v-if="saving" class="spin" />
            <Check v-else />
            {{ saving ? '保存中' : '保存' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Check, Globe, LoaderCircle, Phone, Smartphone, CreditCard, ShoppingBag, Wallet, Calculator, BookOpen, Settings, X, Wrench, Zap, Star, Link } from 'lucide-vue-next'
import { markRaw } from 'vue'

const props = defineProps({
  item: { type: Object, default: null },
  categories: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'confirm'])
const dialogRef = ref(null)
const saving = ref(false)
const errorMessage = ref('')
const showCategorySuggestions = ref(false)
let hideCategoryTimer = null

const catSuggestions = computed(() => {
  if (props.categories.includes(form.category)) return props.categories
  return [...new Set([...props.categories, form.category.trim()].filter(Boolean))]
})

function hideCategoryDelay() {
  hideCategoryTimer = setTimeout(() => { showCategorySuggestions.value = false }, 150)
}

const iconOptions = [
  { name: 'Globe', label: '网站', comp: markRaw(Globe) },
  { name: 'Phone', label: '电话', comp: markRaw(Phone) },
  { name: 'Smartphone', label: 'SIM卡', comp: markRaw(Smartphone) },
  { name: 'CreditCard', label: '信用卡', comp: markRaw(CreditCard) },
  { name: 'ShoppingBag', label: '购物', comp: markRaw(ShoppingBag) },
  { name: 'Wallet', label: '钱包', comp: markRaw(Wallet) },
  { name: 'Calculator', label: '计算', comp: markRaw(Calculator) },
  { name: 'BookOpen', label: '学习', comp: markRaw(BookOpen) },
  { name: 'Settings', label: '设置', comp: markRaw(Settings) },
  { name: 'Wrench', label: '工具', comp: markRaw(Wrench) },
  { name: 'Zap', label: '闪电', comp: markRaw(Zap) },
  { name: 'Star', label: '收藏', comp: markRaw(Star) },
  { name: 'Link', label: '链接', comp: markRaw(Link) },
]

const form = reactive({
  name: props.item?.name || '',
  url: props.item?.url || '',
  icon: props.item?.icon || 'Globe',
  note: props.item?.note || '',
  category: props.item?.category || '',
  sortOrder: props.item?.sortOrder ?? 0
})

const canSave = computed(() => form.name.trim() && form.url.trim())

let previousActiveElement = null
let previousBodyOverflow = ''

function handleConfirm() {
  if (!canSave.value || saving.value) return
  errorMessage.value = ''
  saving.value = true
  emit('confirm', {
    name: form.name.trim(),
    url: form.url.trim(),
    icon: form.icon,
    note: form.note.trim(),
    category: form.category.trim(),
    sortOrder: Number(form.sortOrder) || 0
  }, (error) => {
    if (error) {
      errorMessage.value = error
      saving.value = false
    }
  })
}

function requestClose() {
  if (saving.value) return
  emit('close')
}

function handleDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
    return
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    if (!saving.value && canSave.value) handleConfirm()
    return
  }
  if (event.key !== 'Tab' || !dialogRef.value) return
  const focusable = [...dialogRef.value.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

onMounted(async () => {
  previousActiveElement = document.activeElement
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  await nextTick()
  dialogRef.value?.querySelector('input')?.focus()
  dialogRef.value?.addEventListener('keydown', handleDialogKeydown)
})

onBeforeUnmount(() => {
  if (hideCategoryTimer) clearTimeout(hideCategoryTimer)
  document.body.style.overflow = previousBodyOverflow
  dialogRef.value?.removeEventListener('keydown', handleDialogKeydown)
  if (previousActiveElement instanceof HTMLElement) previousActiveElement.focus()
})
</script>

<style scoped>
.tool-dialog-mask{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,18,20,.66);backdrop-filter:blur(7px)}
.tool-dialog{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;background:#fffdf6;border:2px solid #171918;border-radius:8px;box-shadow:12px 12px 0 #171918;outline:none}
.tool-dialog__header{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 16px;border-bottom:2px solid #171918}
.tool-dialog__header h2{margin:2px 0 0;font-size:22px;line-height:1.1;color:#171918}
.tool-kicker{font-size:10px;font-weight:900;letter-spacing:1.4px;color:#80d7ff}
.icon-command{width:36px;height:36px;display:grid;place-items:center;border:2px solid #171918;background:#bdf6df;box-shadow:3px 3px 0 #171918;transition:transform .16s,box-shadow .16s}
.icon-command svg{width:18px}
.icon-command:hover:not(:disabled){transform:translate(-1px,-1px);box-shadow:5px 5px 0 #171918}
.icon-command:disabled{opacity:.45}
.tool-dialog__body{padding:20px 22px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field{display:flex;flex-direction:column;gap:6px;position:relative}
.field.full{grid-column:1/-1}
.field>span{font-size:11px;font-weight:900;color:#555a57}
.field input,.field textarea{width:100%;border:1.5px solid #171918;border-radius:5px;background:#fff;padding:10px 11px;font-size:13px;color:#171918;outline:none;transition:border-color .15s,box-shadow .15s,background .15s}
.field input:hover,.field textarea:hover{background:#fff}
.field input:focus,.field textarea:focus{border-color:#087e57;box-shadow:0 0 0 3px rgba(189,246,223,.9)}
.icon-select{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1.5px solid #171918;border-radius:5px;background:#fff}
.icon-select button{width:36px;height:36px;display:grid;place-items:center;border:1.5px solid #eee9dc;border-radius:4px;background:#fff;cursor:pointer;transition:.15s}
.icon-select button:hover{background:#f5f1e6}
.icon-select button.selected{background:#bdf6df;border-color:#087e57;box-shadow:2px 2px 0 #171918}
.cat-suggest{position:absolute;top:100%;left:0;right:0;z-index:10;margin-top:3px;background:#fff;border:1.5px solid #171918;border-radius:5px;box-shadow:4px 4px 0 rgba(23,25,24,.9);overflow:hidden}
.cat-suggest button{display:block;width:100%;padding:8px 11px;font-size:12px;text-align:left;background:#fff;border:none;cursor:pointer;transition:.12s}
.cat-suggest button:hover{background:#bdf6df}
.form-error{margin:-8px 22px 14px;padding:9px 11px;border-left:4px solid #e74831;background:#ffe7e2;color:#9f2c1c;font-size:12px;font-weight:700}
.tool-dialog__footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 22px;border-top:2px solid #171918;background:#fffdf6}
.tool-dialog__footer>span{font-size:11px;color:#777;max-width:55%;line-height:1.4}
.tool-dialog__footer>div{display:flex;gap:8px}
.secondary-command,.primary-command{height:38px;padding:0 16px;border:1.5px solid #171918;font-size:12px;font-weight:900;display:flex;align-items:center;gap:7px;justify-content:center;min-width:92px;border-radius:4px}
.secondary-command{background:#fff}
.secondary-command:hover:not(:disabled){background:#eee9dc}
.primary-command{background:#bdf6df;box-shadow:3px 3px 0 #171918;min-width:118px;transition:transform .15s,box-shadow .15s}
.primary-command:hover:not(:disabled){transform:translate(-1px,-1px);box-shadow:5px 5px 0 #171918}
.primary-command:disabled,.secondary-command:disabled{opacity:.48;cursor:not-allowed}
.primary-command svg{width:16px}
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:640px){.tool-dialog-mask{padding:10px}.tool-dialog{max-height:calc(100vh - 20px);box-shadow:5px 5px 0 #171918}.form-grid{grid-template-columns:1fr;padding:16px}.field.full{grid-column:auto}.tool-dialog__footer{align-items:flex-end}.tool-dialog__footer>span{display:none}}
</style>
