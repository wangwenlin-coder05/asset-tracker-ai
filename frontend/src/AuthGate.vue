<template>
  <div v-if="!auth.ready" class="auth-page">正在检查登录状态…</div>
  <template v-else-if="auth.user">
    <BusinessApp />
  </template>
  <main v-else class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <div class="auth-brand">智能投研 · 独立账户</div>
      <h1>{{ registering ? '创建账户' : '欢迎回来' }}</h1>
      <p>每个账户独立保存数据。AI 由你在提供商官网申请 Token，自行承担用量费用。</p>
      <label>邮箱<input v-model.trim="email" type="email" autocomplete="username" required maxlength="254" /></label>
      <label>密码<input v-model="password" type="password" :autocomplete="registering ? 'new-password' : 'current-password'" required :minlength="registering ? 12 : undefined" maxlength="72" /></label>
      <p v-if="registering" class="auth-hint">至少 12 个字符，不超过 72 字节。请勿使用其他网站的密码。</p>
      <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
      <button class="auth-primary" :disabled="busy">{{ busy ? '处理中…' : registering ? '注册并登录' : '登录' }}</button>
      <button type="button" class="auth-switch" @click="registering = !registering; error = ''; password = ''">{{ registering ? '已有账户？去登录' : '没有账户？注册' }}</button>
      <small>仅提供信息整理工具，不构成投资建议。</small>
    </form>
  </main>
</template>

<script setup>
import { ref, defineAsyncComponent, onMounted } from 'vue'
import { auth, authRequest, setSession, logout } from './auth'

const BusinessApp = defineAsyncComponent(() => import('./App.vue'))
const email = ref('')
const password = ref('')
const registering = ref(false)
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  try { setSession(await authRequest('me')) } catch (failure) { if (failure.message !== '请先登录') error.value = failure.message }
  finally { auth.ready = true }
})

async function submit() {
  busy.value = true
  error.value = ''
  try {
    setSession(await authRequest(registering.value ? 'register' : 'login', { email: email.value, password: password.value }))
    password.value = ''
  } catch (failure) { error.value = failure.message }
  finally { busy.value = false }
}

async function signOut() {
  try { await logout() } catch (failure) { error.value = failure.message }
}
</script>

<style scoped>
.auth-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(ellipse at top, #dceaff, #f6f7fb 65%); color: #18304d; }
.auth-card { width: min(440px, 100%); padding: 36px; border-radius: 24px; background: white; box-shadow: 0 20px 60px #16325918; display: grid; gap: 18px; }
.auth-brand { color: #537ba6; font-size: 13px; letter-spacing: 2px; }
h1 { font-size: 28px; font-weight: 700; }
p, small { font-size: 13px; line-height: 1.8; color: #63748a; }
label { font-size: 13px; font-weight: 600; display: grid; gap: 8px; }
input { border: 1px solid #d8e1ec; border-radius: 10px; padding: 12px; width: 100%; }
input:focus { outline: 2px solid #8fb6ee; }
.auth-primary { padding: 13px; border-radius: 10px; background: #2464aa; color: white; }
.auth-primary:disabled { opacity: .6; }
.auth-switch { color: #2464aa; font-size: 13px; }
.auth-error { color: #b42340; }
.auth-hint { font-size: 12px; }
.account-chip { position: fixed; top: 8px; right: 16px; z-index: 45; border: 1px solid #dbe4ee; border-radius: 20px; background: #fffffff2; padding: 6px 12px; display: flex; gap: 12px; font-size: 11px; color: #456; max-width: 90vw; }
.account-chip button { color: #2464aa; }
</style>
