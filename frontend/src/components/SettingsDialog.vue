<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-2" @click.self="$emit('close')">
    <section class="w-full max-w-[95vw] max-h-[95vh] h-full rounded-xl bg-white shadow-2xl flex flex-col">
      <!-- 头部：标题 + 分区标签 -->
      <div class="px-5 pt-4 shrink-0">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-slate-800">设置</h2>
          <button class="text-xl leading-none text-slate-400 hover:text-slate-700" title="关闭" @click="$emit('close')">×</button>
        </div>
        <div class="flex items-center gap-1 mt-3 border-b border-slate-200 overflow-x-auto">
          <button
            v-for="tab in TABS" :key="tab.key"
            class="shrink-0 whitespace-nowrap px-3.5 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px transition-colors"
            :class="activeSection === tab.key ? 'border-primary text-primary font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'"
            @click="activeSection = tab.key"
          >
            <component :is="tab.icon" class="w-4 h-4" />{{ tab.label }}
          </button>
        </div>
      </div>

      <!-- 内容区 -->
      <div class="flex-1 min-h-0 px-5 py-4 flex flex-col">

        <!-- ===== 账号安全 ===== -->
        <div v-if="activeSection === 'account'" class="h-full overflow-y-auto overscroll-contain">
          <div class="max-w-4xl space-y-4 pb-2">
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 class="text-sm font-semibold text-slate-700">当前账号</h3>
              <p class="mt-2 break-all text-sm text-slate-600">{{ auth.user.email }}</p>
              <p class="mt-1 text-xs text-slate-400">数据绑定账号 ID；修改邮箱或密码不会丢失资产和设置。</p>
            </div>
            <p v-if="accountError" class="rounded-lg bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ accountError }}</p>
            <p v-if="accountSuccess" class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-600" role="status">{{ accountSuccess }}</p>
            <form class="space-y-3 rounded-lg border border-slate-200 p-4" @submit.prevent="changeAccount">
              <h3 class="text-sm font-semibold text-slate-700">修改登录账号</h3>
              <label for="account-email" class="block text-xs text-slate-600">新的邮箱账号</label>
              <input id="account-email" v-model.trim="accountForm.email" type="email" autocomplete="username" required maxlength="254" class="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
              <label for="account-current-password" class="block text-xs text-slate-600">当前密码</label>
              <input id="account-current-password" v-model="accountForm.currentPassword" type="password" autocomplete="current-password" required maxlength="72" class="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
              <button type="submit" :disabled="accountBusy !== ''" class="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">{{ accountBusy === 'account' ? '修改中…' : '修改账号' }}</button>
            </form>
            <form class="space-y-3 rounded-lg border border-slate-200 p-4" @submit.prevent="changePassword">
              <h3 class="text-sm font-semibold text-slate-700">修改密码</h3>
              <label for="password-current-password" class="block text-xs text-slate-600">当前密码</label>
              <input id="password-current-password" v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required maxlength="72" class="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
              <label for="account-new-password" class="block text-xs text-slate-600">新密码（至少 8 个字符）</label>
              <input id="account-new-password" v-model="passwordForm.newPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="72" class="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
              <label for="account-confirm-password" class="block text-xs text-slate-600">再次输入新密码</label>
              <input id="account-confirm-password" v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="72" class="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
              <p class="text-xs text-slate-400">修改后会撤销其他设备的会话；当前设备会自动换用新会话。</p>
              <button type="submit" :disabled="accountBusy !== ''" class="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">{{ accountBusy === 'password' ? '修改中…' : '修改密码' }}</button>
            </form>
            <div class="flex items-center justify-between gap-3 rounded-lg border border-rose-100 p-4">
              <span class="text-xs text-slate-500">退出当前设备，不删除账号及数据。</span>
              <button type="button" :disabled="accountBusy !== ''" class="shrink-0 rounded border border-rose-200 px-4 py-2 text-sm text-rose-600 disabled:opacity-50" @click="signOutAccount">{{ accountBusy === 'logout' ? '退出中…' : '退出登录' }}</button>
            </div>
          </div>
        </div>
        <!-- ===== AI 与模型 ===== -->
        <div v-else-if="activeSection === 'ai'" class="h-full overflow-y-auto overscroll-contain">
          <!-- 竖向单列排布：模型中心在上，模型分配与接入、联网搜索等依次往下排，不再左右分栏 -->
          <div class="grid gap-4 pb-2">
            <!-- 上：模型中心（按厂商分组获取全部模型） -->
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between gap-2 mb-3">
                <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Sparkles class="w-4 h-4 text-indigo-500" />模型中心
                </div>
                <button type="button" class="shrink-0 rounded bg-primary px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50" :disabled="fetchingAll" @click="fetchAllVendorModels">{{ fetchingAll ? '获取中…' : '获取全部模型' }}</button>
              </div>
              <p class="text-[11px] text-slate-500">按厂商逐个拉取其官方模型清单，结果按厂商分类展示；获取成功后会同步到右侧模型分配的下拉列表。</p>
              <p v-if="modelCenterMsg" class="mt-2 text-[11px] text-slate-600">{{ modelCenterMsg }}</p>
              <div v-if="!vendorGroups.length && !fetchingAll" class="mt-3 rounded border border-dashed border-slate-200 p-4 text-center text-[11px] text-slate-400">
                点「获取全部模型」开始；仅已配置 API Key 的厂商能返回完整清单。
              </div>
              <div class="mt-3 space-y-2">
                <div v-for="group in vendorGroups" :key="group.id" class="rounded border border-slate-200 bg-white p-2.5">
                  <div class="flex items-center gap-2">
                    <span class="w-6 h-6 shrink-0 rounded-full text-[10px] font-semibold text-white flex items-center justify-center" :style="{ background: vendorColor(group.id) }">{{ vendorInitial(group.name) }}</span>
                    <span class="min-w-0 flex-1 truncate text-xs font-medium text-slate-700" :title="group.name">{{ group.name }}</span>
                    <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]" :class="group.kind === 'builtin' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'">{{ group.kind === 'builtin' ? '内置' : '自定义' }}</span>
                    <span v-if="group.ok" class="shrink-0 text-[10px] text-slate-400">{{ group.models.length }} 个</span>
                  </div>
                  <div v-if="group.ok" class="mt-2 max-h-40 overflow-y-auto overscroll-contain">
                    <div class="flex flex-wrap gap-1">
                      <span v-for="model in group.models" :key="model" class="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">{{ model }}</span>
                    </div>
                  </div>
                  <p v-else class="mt-1.5 text-[10px] text-amber-600">{{ group.error }}</p>
                </div>
              </div>
            </div>

            <!-- 下：模型分配与接入（含联网搜索、密钥与引擎顺序） -->
            <div class="space-y-4">
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-3">
                <FlaskConical class="w-4 h-4 text-indigo-500" />模型分配与接入
              </div>
              <div class="space-y-3">
                <div class="rounded border border-indigo-100 bg-indigo-50/50 p-3">
                  <div class="text-xs font-semibold text-slate-700">板块模型分配</div>
                  <p class="mt-1 text-[11px] text-slate-500">分别指定 AI 问答、文章生成、行情分析、人生规划使用的模型；模型费用由你的 Token 账户承担。</p>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <label class="text-[11px] text-slate-600">AI 问答<select v-model="modelRoutes.assistant" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white"><optgroup v-for="group in settingsGroups" :key="group.id" :label="group.name"><option v-for="model in group.models" :key="model" :value="model">{{ model }}</option></optgroup></select></label>
                    <label class="text-[11px] text-slate-600">文章生成<select v-model="modelRoutes.article" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white"><optgroup v-for="group in settingsGroups" :key="group.id" :label="group.name"><option v-for="model in group.models" :key="model" :value="model">{{ model }}</option></optgroup></select></label>
                    <label class="text-[11px] text-slate-600">行情分析<select v-model="modelRoutes.market" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white"><optgroup v-for="group in settingsGroups" :key="group.id" :label="group.name"><option v-for="model in group.models" :key="model" :value="model">{{ model }}</option></optgroup></select></label>
                    <label class="text-[11px] text-slate-600">人生规划<select v-model="modelRoutes.life" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white"><optgroup v-for="group in settingsGroups" :key="group.id" :label="group.name"><option v-for="model in group.models" :key="model" :value="model">{{ model }}</option></optgroup></select></label>
                  </div>
                </div>

                <!-- 粘贴模型文档自动接入 -->
                <div class="rounded border border-slate-200 bg-slate-50/60 p-3">
                  <div class="text-xs font-semibold text-slate-700">粘贴模型文档自动接入</div>
                  <p class="mt-1 text-[11px] text-slate-500">把任意厂商的官方 API 文档整段复制粘贴到下方，点击「AI 解析」，系统会自动识别 Base URL、接口路径、认证方式与模型名称；未配置任何 Key 时自动改用规则解析。</p>
                  <textarea v-model="docText" rows="4" spellcheck="false" class="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-[11px] font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="在此粘贴模型官网对接文档…"></textarea>
                  <div class="mt-2 flex items-center gap-2">
                    <button type="button" class="shrink-0 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50" :disabled="parsingDoc" @click="parseModelDoc">{{ parsingDoc ? '解析中…' : 'AI 解析' }}</button>
                    <p v-if="docParseNote" class="min-w-0 flex-1 truncate text-[11px] text-slate-500" :title="docParseNote">{{ docParseNote }}</p>
                  </div>
                  <p v-if="docError" class="mt-2 text-[11px] text-rose-500">{{ docError }}</p>
                  <div v-if="parsedConfig" class="mt-3 space-y-2 rounded border border-slate-200 bg-white p-3">
                    <div class="grid gap-2 sm:grid-cols-2">
                      <label class="block text-[11px] text-slate-600">模型名称<input v-model="parsedConfig.name" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-primary" /></label>
                      <label class="block text-[11px] text-slate-600">接口路径<input v-model="parsedConfig.path" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-primary" /></label>
                      <label class="block text-[11px] text-slate-600">Base URL<input v-model="parsedConfig.baseUrl" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-primary" /></label>
                      <div>
                        <label class="block text-[11px] text-slate-600">模型 ID（逗号分隔）</label>
                        <div class="mt-1 flex items-center gap-1.5">
                          <input v-model="parsedModelsText" class="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-primary" placeholder="留空可点右侧按钮自动获取" />
                          <button type="button" class="shrink-0 rounded border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50" :disabled="fetchingModels" @click="fetchParsedModels">{{ fetchingModels ? '获取中…' : '从接口获取' }}</button>
                        </div>
                      </div>
                      <label class="block text-[11px] text-slate-600">认证方式<select v-model="parsedConfig.authStyle" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white"><option value="bearer">Authorization: Bearer</option><option value="x-api-key">x-api-key</option></select></label>
                      <label class="block text-[11px] text-slate-600">接口风格<select v-model="parsedConfig.apiStyle" class="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white"><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 兼容</option></select></label>
                    </div>
                    <p v-if="fetchModelsMsg" class="text-[11px] text-emerald-600">{{ fetchModelsMsg }}</p>
                    <div>
                      <label class="block text-[11px] text-slate-600">API Key</label>
                      <div class="mt-1 flex items-center gap-1.5">
                        <div class="relative min-w-0 flex-1">
                          <input v-model="parsedKey" :type="reveal.parsed ? 'text' : 'password'" autocomplete="off" class="w-full rounded border border-slate-200 px-2 py-1.5 pr-8 text-xs outline-none focus:border-primary" placeholder="粘贴该厂商的 API Key，加密保存" />
                          <button type="button" class="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" :title="reveal.parsed ? '隐藏' : '查看'" @click="reveal.parsed = !reveal.parsed">
                            <component :is="reveal.parsed ? EyeOff : Eye" class="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button type="button" class="shrink-0 rounded border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="复制框内内容" @click="copySecret('parsed', '')"><Copy class="w-3.5 h-3.5" /></button>
                        <button type="button" class="shrink-0 rounded border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="从剪贴板粘贴" @click="pasteSecret('parsed', '')"><ClipboardPaste class="w-3.5 h-3.5" /></button>
                      </div>
                      <p v-if="keyHint.parsed" class="mt-1 text-[11px] text-emerald-600">{{ keyHint.parsed }}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <button type="button" class="shrink-0 rounded bg-primary px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50" :disabled="savingDoc" @click="saveParsedModel">{{ savingDoc ? '保存中…' : '保存接入' }}</button>
                      <p v-if="docSavedMsg" class="min-w-0 flex-1 truncate text-[11px] text-emerald-600" :title="docSavedMsg">{{ docSavedMsg }}</p>
                    </div>
                  </div>
                  <div v-if="customModels.length" class="mt-3 space-y-1">
                    <div class="text-[11px] font-medium text-slate-600">已接入的自定义模型</div>
                    <div v-for="m in customModels" :key="m.id" class="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                      <span class="min-w-0 truncate text-[11px] text-slate-600" :title="`${m.baseUrl}${m.path}`">{{ m.name }} · {{ (m.models || []).join(', ') }}</span>
                      <div class="flex items-center gap-2 shrink-0">
                        <button type="button" class="text-[11px] text-primary hover:text-blue-700 disabled:opacity-50" :disabled="fetchingId === m.id" @click="refreshCustomModel(m)">{{ fetchingId === m.id ? '刷新中…' : '刷新模型' }}</button>
                        <button type="button" class="text-[11px] text-rose-500 hover:text-rose-600" @click="removeCustomModel(m.id)">移除</button>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- 自定义模型 Key：AI 解析接入的模型可能来自不同厂商，各自独立一行 -->
                <div class="rounded border border-slate-200 bg-slate-50/60 p-3">
                  <div class="text-xs font-semibold text-slate-700">自定义模型 Key</div>
                  <p class="mt-1 text-[11px] text-slate-500">解析接入的模型可能来自不同厂商，各厂商用各自的 Key；这里每个厂商单独一行，输入后自动保存，与内置厂商互不影响。</p>
                  <div v-if="!customModels.length" class="mt-2 rounded border border-dashed border-slate-200 p-3 text-center text-[11px] text-slate-400">
                    暂无自定义模型，先在上方粘贴文档并保存接入。
                  </div>
                  <div v-else class="mt-2 space-y-3">
                    <div v-for="m in customModels" :key="m.id" class="rounded border border-slate-200 bg-white p-2.5">
                      <div class="flex items-center gap-2">
                        <span class="min-w-0 flex-1 truncate text-xs font-medium text-slate-700" :title="`${m.baseUrl}${m.path}`">{{ m.name }}</span>
                        <span v-if="customKeyConfigured[m.keyField]" class="shrink-0 text-[11px] text-emerald-600">已配置</span>
                        <span v-else class="shrink-0 text-[11px] text-amber-600">未配置</span>
                      </div>
                      <p v-if="m.models?.length" class="mt-0.5 truncate text-[11px] text-slate-400">{{ m.models.join(', ') }}</p>
                      <div v-if="m.keyField" class="mt-1.5 flex items-center gap-1.5">
                        <div class="relative min-w-0 flex-1">
                          <input v-model="draftKeys[m.keyField]" :type="reveal[m.keyField] ? 'text' : 'password'" autocomplete="off" class="w-full rounded border border-slate-200 px-2 py-1.5 pr-8 text-xs outline-none focus:border-primary" placeholder="粘贴该厂商的 API Key，输入后自动保存" @input="autoSaveCustomKey(m.keyField)" />
                          <button type="button" class="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" :title="reveal[m.keyField] ? '隐藏' : '查看'" @click="reveal[m.keyField] = !reveal[m.keyField]">
                            <component :is="reveal[m.keyField] ? EyeOff : Eye" class="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button type="button" class="shrink-0 rounded border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="复制框内内容" @click="copySecret(m.keyField, m.keyField)"><Copy class="w-3.5 h-3.5" /></button>
                        <button type="button" class="shrink-0 rounded border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="从剪贴板粘贴" @click="pasteSecret(m.keyField, m.keyField)"><ClipboardPaste class="w-3.5 h-3.5" /></button>
                        <button v-if="customKeyConfigured[m.keyField]" type="button" class="shrink-0 rounded border border-rose-200 px-2 py-1.5 text-[11px] text-rose-500 hover:bg-rose-50" title="删除该厂商的 Key" @click="clearCustomKey(m)">删除</button>
                      </div>
                      <p v-else class="mt-1 text-[11px] text-amber-600">缺少配置标识，请重新解析该文档后再保存接入</p>
                      <p v-if="keyHint[m.keyField]" class="mt-1 text-[11px] text-emerald-600">{{ keyHint[m.keyField] }}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600">
                    Agnes API Key
                    <a href="https://platform.agnes-ai.com" target="_blank" rel="noopener noreferrer" class="ml-2 text-primary">官网申请</a>
                    <span v-if="configured.agnes" class="ml-2 text-[11px] text-emerald-600">已配置</span>
                  </label>
                  <div class="mt-1 flex items-center gap-1.5">
                    <div class="relative min-w-0 flex-1">
                      <input v-model="form.agnes_api_key" :type="reveal.agnes ? 'text' : 'password'" autocomplete="off" class="w-full rounded border border-slate-200 px-3 py-2 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="留空则保持现有配置，输入后自动保存" @input="autoSaveSecret('agnes', 'agnes_api_key')" />
                      <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" :title="reveal.agnes ? '隐藏' : '查看'" @click="reveal.agnes = !reveal.agnes">
                        <component :is="reveal.agnes ? EyeOff : Eye" class="w-4 h-4" />
                      </button>
                    </div>
                    <button type="button" class="shrink-0 rounded border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="复制框内内容" @click="copySecret('agnes', 'agnes_api_key')"><Copy class="w-3.5 h-3.5" /></button>
                    <button type="button" class="shrink-0 rounded border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="从剪贴板粘贴" @click="pasteSecret('agnes', 'agnes_api_key')"><ClipboardPaste class="w-3.5 h-3.5" /></button>
                  </div>
                  <p v-if="keyHint.agnes" class="mt-1 text-[11px] text-emerald-600">{{ keyHint.agnes }}</p>
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600">
                    GLM API Key
                    <a href="https://open.bigmodel.cn" target="_blank" rel="noopener noreferrer" class="ml-2 text-primary">官网申请</a>
                    <span v-if="configured.glm" class="ml-2 text-[11px] text-emerald-600">已配置</span>
                  </label>
                  <div class="mt-1 flex items-center gap-1.5">
                    <div class="relative min-w-0 flex-1">
                      <input v-model="form.glm_api_key" :type="reveal.glm ? 'text' : 'password'" autocomplete="off" class="w-full rounded border border-slate-200 px-3 py-2 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="留空则保持现有配置，输入后自动保存" @input="autoSaveSecret('glm', 'glm_api_key')" />
                      <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" :title="reveal.glm ? '隐藏' : '查看'" @click="reveal.glm = !reveal.glm">
                        <component :is="reveal.glm ? EyeOff : Eye" class="w-4 h-4" />
                      </button>
                    </div>
                    <button type="button" class="shrink-0 rounded border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="复制框内内容" @click="copySecret('glm', 'glm_api_key')"><Copy class="w-3.5 h-3.5" /></button>
                    <button type="button" class="shrink-0 rounded border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="从剪贴板粘贴" @click="pasteSecret('glm', 'glm_api_key')"><ClipboardPaste class="w-3.5 h-3.5" /></button>
                  </div>
                  <p v-if="keyHint.glm" class="mt-1 text-[11px] text-emerald-600">{{ keyHint.glm }}</p>
                </div>
                <label class="block text-xs font-medium text-slate-600">
                  默认 AI 模型
                  <select v-model="form.default_model" class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-white">
                    <optgroup v-for="group in settingsGroups" :key="group.id" :label="group.name"><option v-for="model in group.models" :key="model" :value="model">{{ model }}</option></optgroup>
                  </select>
                </label>
                <div class="flex items-center gap-2">
                  <button type="button" class="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5 shrink-0" :disabled="testingModel" @click="testModel">
                    <FlaskConical class="w-3.5 h-3.5" />{{ testingModel ? '测试中...' : '模型测试' }}
                  </button>
                  <p v-if="testResult" class="text-xs text-emerald-600 truncate flex-1" :title="testResult">{{ testResult }}</p>
                  <p v-if="testError" class="text-xs text-rose-500 truncate flex-1" :title="testError">{{ testError }}</p>
                </div>
              </div>
            </div>

            <!-- 联网搜索 -->
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1">
                <Globe class="w-4 h-4 text-sky-500" />联网搜索
              </div>
              <p class="text-[11px] text-slate-500 mb-3">人生规划器在回答考试、政策、薪资等实时问题前会自动联网，按下面列表的顺序依次尝试，某家报错或返回空结果就切下一家，成功即停。秘塔（需密钥，默认首选）、豆包搜索（需密钥，备用）、Tavily（需密钥，兜底）三家未配密钥会自动跳过；SearXNG 由服务自动拉起，内部只开启中文引擎（百度 / 搜狗 / 360 / 夸克 / 中国搜索），Bing 与 Claw 免密钥。相同问题 30 分钟内命中缓存，不重复消耗额度。</p>
              <!-- 搜索引擎：排序与密钥合并成同一个面板 —— 需要密钥的引擎直接在自己那一行里填写，
                   不再另开一块密钥表单，免得同一件事分散在两个地方 -->
              <div class="mt-3 rounded-lg border border-slate-200 p-3">
                <div class="text-xs font-semibold text-slate-700">搜索引擎降级顺序</div>
                <p class="mt-1 text-[11px] text-slate-500">从上到下依次尝试，某家报错或返回空结果时才切换下一家，成功即停。调整后自动保存、立即生效，重启服务仍按此顺序（开机自检不再覆盖）。需要密钥的引擎（秘塔 / 豆包 / Tavily）直接在本行填写，未填写会自动跳过。</p>
                <div class="mt-2 space-y-1.5">
                  <div v-for="(item, index) in searchSources" :key="item.id" class="rounded border border-slate-200 px-2 py-1.5">
                    <div class="flex items-center gap-2">
                      <span class="shrink-0 w-5 h-5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 flex items-center justify-center">{{ index + 1 }}</span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 text-xs font-medium text-slate-700">
                          {{ item.name }}
                          <span v-if="item.needKey && !configured[item.id]" class="text-[10px] font-normal text-amber-600">未配置密钥，将自动跳过</span>
                          <span v-else-if="item.needKey" class="text-[10px] font-normal text-emerald-600">已配置</span>
                          <a v-if="keyMeta(item.id)" :href="keyMeta(item.id).site" target="_blank" rel="noopener noreferrer" class="text-[10px] font-normal text-primary">申请密钥</a>
                        </div>
                        <p class="text-[10px] text-slate-400">{{ item.desc }}</p>
                      </div>
                      <button type="button" class="shrink-0 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent" :disabled="index === 0" @click="moveSearchSource(index, -1)">上移</button>
                      <button type="button" class="shrink-0 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent" :disabled="index === searchSources.length - 1" @click="moveSearchSource(index, 1)">下移</button>
                    </div>
                    <template v-if="keyMeta(item.id)">
                      <div class="mt-1.5 flex items-center gap-1.5 pl-7">
                        <div class="relative min-w-0 flex-1">
                          <input v-model="form[keyMeta(item.id).field]" :type="reveal[item.id] ? 'text' : 'password'" autocomplete="off" class="w-full rounded border border-slate-200 px-3 py-1.5 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="粘贴密钥，输入后自动保存" @input="autoSaveSecret(item.id, keyMeta(item.id).field)" />
                          <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" :title="reveal[item.id] ? '隐藏' : '查看'" @click="reveal[item.id] = !reveal[item.id]">
                            <component :is="reveal[item.id] ? EyeOff : Eye" class="w-4 h-4" />
                          </button>
                        </div>
                        <button type="button" class="shrink-0 rounded border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="复制框内内容" @click="copySecret(item.id, keyMeta(item.id).field)"><Copy class="w-3.5 h-3.5" /></button>
                        <button type="button" class="shrink-0 rounded border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="从剪贴板粘贴" @click="pasteSecret(item.id, keyMeta(item.id).field)"><ClipboardPaste class="w-3.5 h-3.5" /></button>
                      </div>
                      <p v-if="keyHint[item.id]" class="mt-1 pl-7 text-[11px] text-emerald-600">{{ keyHint[item.id] }}</p>
                    </template>
                  </div>
                </div>
                <p v-if="searchOrderHint" class="mt-2 text-[11px] text-emerald-600">{{ searchOrderHint }}</p>
              </div>
            </div>
            </div>
          </div>
        </div>

        <!-- ===== 外观与刷新 ===== -->
        <div v-else-if="activeSection === 'appearance'" class="h-full overflow-y-auto overscroll-contain">
          <div class="max-w-4xl space-y-4">
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-3">
                <RefreshCw class="w-4 h-4 text-sky-500" />数据刷新
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label class="block text-xs font-medium text-slate-600">
                  黄金价格每日刷新次数
                  <div class="mt-1 flex items-center gap-2">
                    <input v-model.number="form.gold_daily_count" type="number" min="1" max="500" class="w-24 rounded border border-slate-200 px-2 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="50" />
                    <span class="text-xs text-slate-400">次/天</span>
                  </div>
                  <span class="text-[10px] text-slate-400">间隔约 {{ intervalMinutes }} 分钟</span>
                </label>
                <label class="block text-xs font-medium text-slate-600">
                  实时行情刷新间隔
                  <select v-model.number="form.market_fetch_interval" class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-white">
                    <option :value="15000">15 秒</option>
                    <option :value="30000">30 秒（推荐）</option>
                    <option :value="60000">1 分钟</option>
                    <option :value="120000">2 分钟</option>
                    <option :value="300000">5 分钟</option>
                  </select>
                </label>
              </div>
            </div>
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="text-sm font-semibold text-slate-700 mb-3">蓄水池动画</div>
              <label class="block text-xs font-medium text-slate-600">
                魂环数量
                <select v-model.number="draftRingCount" class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-white">
                  <option v-for="count in MAX_SOUL_RINGS - MIN_SOUL_RINGS + 1" :key="count" :value="count + MIN_SOUL_RINGS - 1">{{ count + MIN_SOUL_RINGS - 1 }} 个{{ count === 4 ? '（默认）' : '' }}</option>
                </select>
              </label>
              <p class="mt-2 text-xs text-slate-400">保存后立即生效；数量越多，魂环出现越密集。此设置保存在当前浏览器。</p>
            </div>
          </div>
        </div>

        <!-- ===== 交易手续费 ===== -->
        <div v-else-if="activeSection === 'fee'" class="h-full overflow-y-auto overscroll-contain">
          <div class="max-w-4xl space-y-4">
            <!-- 档位列表 -->
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Receipt class="w-4 h-4 text-primary" />我的佣金档位
                </div>
                <span class="text-[10px] text-slate-400">点击选中 · 双击档位可编辑</span>
              </div>
              <div class="space-y-2">
                <div
                  v-for="p in feePresets" :key="p.id"
                  class="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
                  :class="[
                    p.id === activeFeeId ? 'border-primary bg-primary/5 ring-1 ring-primary/25' : 'border-slate-200',
                    editingId === p.id ? '' : 'cursor-pointer hover:bg-slate-50'
                  ]"
                  @click="editingId === p.id || (activeFeeId = p.id)"
                  @dblclick.stop="startEdit(p)"
                >
                  <span class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                    :class="p.id === activeFeeId ? 'border-primary bg-primary' : 'border-slate-300'">
                    <span v-if="p.id === activeFeeId" class="w-1.5 h-1.5 rounded-full bg-white"></span>
                  </span>

                  <!-- 展示态 -->
                  <div v-if="editingId !== p.id" class="flex-1 min-w-0" title="双击编辑">
                    <div class="text-sm text-slate-700 truncate">{{ p.name }}</div>
                    <div class="text-[11px] text-slate-400">股票 万{{ toWan(p.rate) }} · 最低 {{ p.min }} 元</div>
                    <div v-if="feeExtras(p).length" class="text-[11px] text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                      <span v-for="(ex, i) in feeExtras(p)" :key="i" class="whitespace-nowrap">{{ ex }}</span>
                    </div>
                  </div>

                  <!-- 编辑态 -->
                  <div v-else class="flex-1 min-w-0 space-y-2" @click.stop @dblclick.stop>
                    <div class="flex flex-wrap items-center gap-2">
                      <input
                        :ref="el => (editNameEl = el)"
                        v-model="editForm.name" placeholder="名称"
                        class="w-28 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit"
                      />
                      <span class="text-[11px] text-slate-400">股票 万分之</span>
                      <input
                        v-model.number="editForm.rateWan" type="number" step="0.01" min="0"
                        class="w-20 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit"
                      />
                      <span class="text-[11px] text-slate-400">最低</span>
                      <input
                        v-model.number="editForm.min" type="number" step="1" min="0"
                        class="w-16 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit"
                      />
                      <button class="text-xs text-primary hover:underline shrink-0" @click="commitEdit">确定</button>
                      <button class="text-xs text-slate-400 hover:underline shrink-0" @click="cancelEdit">取消</button>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-[11px] text-slate-400">ETF/LOF 万</span>
                      <input v-model.number="editForm.etfRateWan" type="number" step="0.01" min="0" class="w-16 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400">最低</span>
                      <input v-model.number="editForm.etfMin" type="number" step="0.1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400 ml-2">可转债 沪万</span>
                      <input v-model.number="editForm.cbRateShWan" type="number" step="0.01" min="0" class="w-16 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400">深万</span>
                      <input v-model.number="editForm.cbRateSzWan" type="number" step="0.01" min="0" class="w-16 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400">起步</span>
                      <input v-model.number="editForm.cbMin" type="number" step="0.1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400 ml-2">场内LOF申购</span>
                      <input v-model.number="editForm.lofZhe" type="number" step="0.5" min="0" max="10" class="w-14 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400">折(0为不设)</span>
                    </div>
                  </div>

                  <template v-if="editingId !== p.id">
                    <span v-if="p.id === activeFeeId" class="text-[10px] text-primary font-semibold shrink-0">生效中</span>
                    <button class="text-slate-300 hover:text-rose-500 shrink-0" title="删除该档位" @click.stop="removeFeePreset(p.id)">
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </template>
                </div>
              </div>

              <div class="mt-3 pt-3 border-t border-slate-100">
                <div class="text-[11px] text-slate-400 mb-1.5">快捷添加（最低佣金 5 元）</div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="q in QUICK_FEE_OPTIONS" :key="q.label"
                    class="px-2.5 py-1 rounded-full border border-slate-200 text-xs text-slate-600 hover:border-primary hover:text-primary transition-colors"
                    @click="quickAddFee(q)"
                  >{{ q.label }}</button>
                </div>
                <div class="text-[11px] text-slate-400 mt-3 mb-1.5">华宝优惠档位</div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="h in HUABAO_PRESETS" :key="h.name"
                    class="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs text-primary hover:bg-primary/10 hover:border-primary transition-colors"
                    @click="quickAddHuabao(h)"
                  >{{ h.name }}</button>
                </div>
              </div>
            </div>

            <!-- 自定义新增 -->
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="text-sm font-semibold text-slate-700 mb-3">新增自定义档位</div>
              <div class="space-y-3">
                <p class="text-xs text-slate-500">你自备官网 Token 并自行承担 AI 费用。密钥只保存到你的账户，不使用平台共享密钥。</p>
                <div>
                  <label class="block text-xs font-medium text-slate-600">
                    ALAPI Token（可选，黄金行情）
                    <a href="https://www.alapi.cn" target="_blank" rel="noopener noreferrer" class="ml-2 text-primary">官网申请</a>
                  </label>
                  <div class="mt-1 flex items-center gap-1.5">
                    <div class="relative min-w-0 flex-1 max-w-sm">
                      <input v-model="form.alapi_token" :type="reveal.alapi ? 'text' : 'password'" autocomplete="off" class="w-full rounded border border-slate-200 px-3 py-2 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="留空保持现有配置，输入后自动保存" @input="autoSaveSecret('alapi', 'alapi_token')" />
                      <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" :title="reveal.alapi ? '隐藏' : '查看'" @click="reveal.alapi = !reveal.alapi">
                        <component :is="reveal.alapi ? EyeOff : Eye" class="w-4 h-4" />
                      </button>
                    </div>
                    <button type="button" class="shrink-0 rounded border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="复制框内内容" @click="copySecret('alapi', 'alapi_token')"><Copy class="w-3.5 h-3.5" /></button>
                    <button type="button" class="shrink-0 rounded border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="从剪贴板粘贴" @click="pasteSecret('alapi', 'alapi_token')"><ClipboardPaste class="w-3.5 h-3.5" /></button>
                  </div>
                  <p v-if="keyHint.alapi" class="mt-1 text-[11px] text-emerald-600">{{ keyHint.alapi }}</p>
                </div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <button type="button" class="text-rose-500" @click="clearKey('glm_api_key')">删除 GLM 密钥</button>
                  <button type="button" class="text-rose-500" @click="clearKey('agnes_api_key')">删除 Agnes 密钥</button>
                  <button type="button" class="text-rose-500" @click="clearKey('alapi_token')">删除 ALAPI Token</button>
                </div>
                <label class="block text-xs font-medium text-slate-600">
                  名称
                  <input v-model="newFee.name" placeholder="如：新开户" class="mt-1 w-full max-w-sm rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                </label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="rounded-lg border border-slate-100 p-3">
                    <div class="text-[11px] text-slate-500 mb-2">股票</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400">
                      万分之 <input v-model.number="newFee.rateWan" type="number" step="0.01" min="0" class="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      最低 <input v-model.number="newFee.min" type="number" step="1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /> 元
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-100 p-3">
                    <div class="text-[11px] text-slate-500 mb-2">ETF / LOF（选填）</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400">
                      万分之 <input v-model.number="newFee.etfRateWan" type="number" step="0.01" min="0" class="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      最低 <input v-model.number="newFee.etfMin" type="number" step="0.1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /> 元
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-100 p-3">
                    <div class="text-[11px] text-slate-500 mb-2">可转债（选填）</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                      沪 万分之 <input v-model.number="newFee.cbRateShWan" type="number" step="0.01" min="0" class="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      深 万分之 <input v-model.number="newFee.cbRateSzWan" type="number" step="0.01" min="0" class="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      起步 <input v-model.number="newFee.cbMin" type="number" step="0.1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /> 元
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-100 p-3">
                    <div class="text-[11px] text-slate-500 mb-2">场内 LOF 申购（选填）</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400">
                      <input v-model.number="newFee.lofZhe" type="number" step="0.5" min="0" max="10" class="w-14 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /> 折（0 为不设，如「1折」）
                    </div>
                  </div>
                </div>
                <button class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-blue-700" @click="addFeePreset">添加</button>
                <p v-if="feeHint" class="mt-1 text-xs" :class="feeHintType === 'error' ? 'text-rose-500' : 'text-emerald-600'">{{ feeHint }}</p>
              </div>
            </div>

            <p class="text-[11px] leading-relaxed text-slate-400">
              股票佣金 = 成交额 × 费率，不足最低佣金时按最低收取；印花税 0.1%（仅卖出）、过户费 0.001% 为固定项，无需设置。ETF/LOF、可转债、场内 LOF 申购为可选扩展费率，仅作记录展示。
              档位调整只对之后的买入 / 卖出 / T 计算生效，已录入的历史记录保持不变。
            </p>
          </div>
        </div>

        <!-- ===== 标语库 ===== -->
        <div v-else-if="activeSection === 'tips'" class="h-full overflow-y-auto overscroll-contain">
          <div class="max-w-4xl space-y-4">
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Megaphone class="w-4 h-4 text-primary" />指标栏标语
                </div>
                <span class="text-[10px] text-slate-400">双击可编辑 · 顺序即轮播顺序</span>
              </div>

              <div class="space-y-2">
                <div
                  v-for="(t, i) in tipList" :key="i"
                  class="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                >
                  <span class="w-5 shrink-0 text-center text-[11px] text-slate-400">{{ i + 1 }}</span>

                  <!-- 展示态 -->
                  <div
                    v-if="editingTip !== i"
                    class="flex-1 min-w-0 truncate text-sm text-slate-700"
                    title="双击编辑"
                    @dblclick="startEditTip(i)"
                  >{{ t }}</div>

                  <!-- 编辑态 -->
                  <div v-else class="flex-1 min-w-0 flex items-center gap-2">
                    <input
                      :ref="el => (editTipEl = el)"
                      v-model="editTipText"
                      class="flex-1 min-w-0 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      @keydown.enter.prevent="commitTip" @keydown.esc="cancelTip"
                    />
                    <button class="text-xs text-primary hover:underline shrink-0" @click="commitTip">确定</button>
                    <button class="text-xs text-slate-400 hover:underline shrink-0" @click="cancelTip">取消</button>
                  </div>

                  <div v-if="editingTip !== i" class="flex items-center gap-1 shrink-0">
                    <button class="text-slate-300 hover:text-primary disabled:opacity-30 disabled:hover:text-slate-300" :disabled="i === 0" title="上移" @click="moveTip(i, -1)">
                      <ChevronUp class="w-3.5 h-3.5" />
                    </button>
                    <button class="text-slate-300 hover:text-primary disabled:opacity-30 disabled:hover:text-slate-300" :disabled="i === tipList.length - 1" title="下移" @click="moveTip(i, 1)">
                      <ChevronDown class="w-3.5 h-3.5" />
                    </button>
                    <button class="text-slate-300 hover:text-rose-500" title="删除" @click="removeTip(i)">
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p v-if="!tipList.length" class="py-2 text-xs text-slate-400">暂无标语，保存时会自动恢复为默认标语。</p>
              </div>

              <div class="mt-3 pt-3 border-t border-slate-100 flex items-end gap-2">
                <label class="flex-1 text-xs font-medium text-slate-600">
                  新增标语
                  <input
                    v-model="newTip"
                    placeholder="如：先看风险，再看收益"
                    class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    @keydown.enter.prevent="addTip"
                  />
                </label>
                <button class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-blue-700 shrink-0" @click="addTip">添加</button>
                <button class="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shrink-0" @click="resetTips">恢复默认</button>
              </div>
            </div>

            <p class="text-[11px] leading-relaxed text-slate-400">
              标语显示在观察面板指标栏右侧，每 6 秒竖向轮播一条。可增删改并调整顺序，保存后立即生效。
            </p>
          </div>
        </div>

        <!-- ===== 运行日志 ===== -->
        <div v-else-if="activeSection === 'logs'" class="h-full flex gap-4 min-h-0">
          <!-- AI 统计 + 日志列表 -->
          <div class="w-[360px] shrink-0 flex flex-col">
            <div class="rounded-lg border border-slate-200 bg-slate-50/50 p-4 flex-1 flex flex-col min-h-0">
              <div class="flex items-center gap-4 mb-3 shrink-0">
                <span class="text-sm font-bold text-slate-700 flex items-center gap-1.5 shrink-0"><FlaskConical class="w-4 h-4 text-indigo-500" />AI 调用统计</span>
              </div>
              <!-- 数字卡片 -->
              <div class="grid grid-cols-2 gap-2 mb-3 shrink-0">
                <div class="bg-white rounded-lg border border-slate-100 p-2.5">
                  <div class="text-[10px] text-slate-400">累计调用</div>
                  <div class="text-xl font-bold text-slate-800 mt-0.5">{{ usage.total ?? '--' }}<span class="text-xs font-normal text-slate-400 ml-1">次</span></div>
                </div>
                <div class="bg-white rounded-lg border border-slate-100 p-2.5">
                  <div class="text-[10px] text-slate-400">今日调用</div>
                  <div class="text-xl font-bold text-indigo-600 mt-0.5">{{ usage.today ?? '--' }}<span class="text-xs font-normal text-slate-400 ml-1">次</span></div>
                </div>
              </div>
              <!-- 近 7 天趋势 -->
              <div v-if="usage.trend?.length" class="mb-3 shrink-0">
                <div class="text-[10px] text-slate-400 mb-1.5">近 7 天趋势</div>
                <div class="flex items-end gap-1 h-12 bg-white rounded-lg border border-slate-100 p-2">
                  <div v-for="(d, i) in usage.trend" :key="i" class="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                    <div class="w-full rounded-sm bg-indigo-400/80 transition-all"
                      :style="{ height: trendBarHeight(d.count) + '%' }"
                      :title="`${d.date.slice(5)}: ${d.count} 次`"></div>
                    <span class="text-[9px] text-slate-400 leading-none">{{ d.date.slice(5) }}</span>
                  </div>
                </div>
              </div>
              <!-- 按模型分布 -->
              <div v-if="usage.byModel?.length" class="flex flex-wrap gap-1.5 mb-2 shrink-0">
                <div v-for="m in usage.byModel" :key="m.model" class="flex items-center gap-1 py-0.5 px-2 rounded-lg bg-white border border-slate-100">
                  <span class="text-[10px] text-slate-600 font-mono truncate max-w-[120px]">{{ m.model }}</span>
                  <span class="text-[10px] font-bold text-slate-700">{{ m.count }}</span>
                </div>
              </div>
              <p v-else class="text-xs text-slate-400 py-1 shrink-0">暂无 AI 调用记录，使用 AI 功能后会自动统计</p>

              <!-- 日志列表 -->
              <div class="mt-3 border-t border-slate-200 pt-3 flex-1 flex flex-col min-h-0">
                <div class="flex items-center justify-between mb-2 shrink-0">
                  <div class="flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <Terminal class="w-3.5 h-3.5" />
                    <button
                      class="px-2 py-0.5 rounded transition-colors"
                      :class="activeLogTab === 'ai' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'"
                      @click="switchLogTab('ai')"
                    >AI 调用</button>
                    <button
                      class="px-2 py-0.5 rounded transition-colors"
                      :class="activeLogTab === 'tx' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'"
                      @click="switchLogTab('tx')"
                    >交易记录</button>
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="flex items-center gap-1 text-xs text-slate-400 cursor-pointer select-none" @click.prevent="toggleAutoRefresh">
                      <span class="w-3.5 h-3.5 rounded border border-slate-300 flex items-center justify-center" :class="logAutoRefresh ? 'bg-primary border-primary' : ''">
                        <span v-if="logAutoRefresh" class="text-white text-[8px]">✓</span>
                      </span>
                      自动刷新
                    </label>
                    <button class="text-xs text-blue-500 hover:underline flex items-center gap-0.5" :disabled="loadingLogs" @click="fetchLogs">
                      <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': loadingLogs }" />刷新
                    </button>
                  </div>
                </div>
                <div class="rounded-lg border border-slate-200 bg-white overflow-hidden flex-1 flex flex-col min-h-0">
                  <div class="flex-1 overflow-y-auto text-xs font-mono">
                    <!-- AI 调用日志行 -->
                    <div v-if="activeLogTab === 'ai'" v-for="log in logs" :key="log.id" class="border-b border-slate-100 last:border-b-0">
                      <div
                        class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                        :class="logDetailId === log.id ? 'bg-indigo-50/50 border-l-2 border-indigo-400' : ''"
                        @click="selectLogDetail(log.id)"
                      >
                        <span class="text-slate-400 shrink-0 w-20">{{ formatLogTime(log.created_at) }}</span>
                        <span class="text-slate-600 shrink-0 w-24 truncate" :title="log.model">{{ log.model }}</span>
                        <span class="text-slate-400 shrink-0 w-12 text-right">{{ log.duration_ms }}ms</span>
                        <span v-if="log.success" class="text-emerald-600 shrink-0">✅</span>
                        <span v-else class="text-rose-500 shrink-0">❌</span>
                        <span class="text-slate-400 truncate flex-1 text-right">{{ log.response_len }}B</span>
                      </div>
                    </div>
                    <!-- 交易记录日志行 -->
                    <div v-else v-for="log in logs" :key="log.id" class="border-b border-slate-100 last:border-b-0">
                      <div
                        class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                        :class="logDetailId === log.id ? 'bg-amber-50/60 border-l-2 border-amber-400' : ''"
                        @click="selectLogDetail(log.id)"
                      >
                        <span class="text-slate-400 shrink-0 w-20">{{ formatLogTime(log.created_at) }}</span>
                        <span class="text-slate-600 shrink-0 w-20 truncate" :title="log.action">{{ log.action }}</span>
                        <span class="text-slate-700 shrink-0 w-16 truncate" :title="log.stock_code">{{ log.stock_code }}</span>
                        <span class="text-slate-400 shrink-0 text-right">{{ log.before_count }} → {{ log.after_count }}</span>
                        <span class="text-slate-400 truncate flex-1 text-right">买{{ log.total_buy }}/卖{{ log.total_sell }}</span>
                      </div>
                    </div>
                    <div v-if="!logs.length && !loadingLogs" class="py-6 text-center text-slate-400 text-xs">暂无日志数据</div>
                    <div v-if="loadingLogs" class="py-6 text-center text-slate-400 text-xs">加载中...</div>
                  </div>
                  <div class="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400 shrink-0">
                    <span>共 {{ logTotal }} 条记录</span>
                    <button v-if="logTotal > logs.length" class="text-blue-500 hover:underline" @click="loadMoreLogs">加载更多</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 日志详情 -->
          <div class="flex-1 min-w-0">
            <div class="rounded-lg border border-slate-200 bg-slate-50/50 p-4 h-full flex flex-col">
              <div class="flex items-center justify-between mb-3 shrink-0">
                <span class="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Terminal class="w-3.5 h-3.5" />日志详情
                </span>
                <button v-if="selectedLog" class="text-xs text-slate-400 hover:text-slate-600" @click="logDetailId = null">关闭</button>
              </div>
              <div v-if="selectedLog" class="flex-1 overflow-y-auto text-[10px] text-slate-500 space-y-2">
                <!-- AI 调用日志详情 -->
                <template v-if="activeLogTab === 'ai'">
                  <div class="bg-white rounded-lg border border-slate-100 p-3 space-y-1">
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">模型</span><span class="font-mono text-slate-700">{{ selectedLog.model }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">提供方</span><span>{{ selectedLog.provider }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">时间</span><span>{{ formatLogFull(selectedLog.created_at) }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">耗时</span><span>{{ selectedLog.duration_ms }}ms</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">状态</span>
                      <span :class="selectedLog.success ? 'text-emerald-600' : 'text-rose-500'">{{ selectedLog.success ? '✅ 成功' : '❌ 失败' }}</span>
                    </div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">系统提示</span><span>{{ selectedLog.system_prompt_len }}B</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">用户输入</span><span>{{ selectedLog.user_prompt_len }}B</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">响应大小</span><span>{{ selectedLog.response_len }}B</span></div>
                  </div>
                  <div v-if="!selectedLog.success && selectedLog.error_msg" class="bg-rose-50 rounded-lg border border-rose-200 p-3">
                    <div class="font-semibold text-rose-600 mb-1">错误信息</div>
                    <div class="text-rose-500 break-all whitespace-pre-wrap">{{ selectedLog.error_msg }}</div>
                  </div>
                  <div v-if="selectedLog.request_content" class="bg-white rounded-lg border border-slate-100 p-3">
                    <div class="font-semibold text-slate-600 mb-1">请求内容</div>
                    <pre class="whitespace-pre-wrap break-all bg-slate-50 rounded px-2 py-1.5 overflow-x-auto max-h-48 overflow-y-auto text-[10px] leading-relaxed">{{ selectedLog.request_content }}</pre>
                  </div>
                  <div v-if="selectedLog.response_content" class="bg-white rounded-lg border border-slate-100 p-3">
                    <div class="font-semibold text-slate-600 mb-1">响应内容</div>
                    <pre class="whitespace-pre-wrap break-all bg-slate-50 rounded px-2 py-1.5 overflow-x-auto max-h-48 overflow-y-auto text-[10px] leading-relaxed">{{ selectedLog.response_content }}</pre>
                  </div>
                </template>
                <!-- 交易记录日志详情 -->
                <template v-else>
                  <div class="bg-white rounded-lg border border-slate-100 p-3 space-y-1">
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">操作</span><span class="font-mono text-amber-600">{{ selectedLog.action }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">股票代码</span><span class="font-mono text-slate-700">{{ selectedLog.stock_code || '-' }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">时间</span><span>{{ formatLogFull(selectedLog.created_at) }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">持仓变化</span><span>{{ selectedLog.before_count }} → {{ selectedLog.after_count }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">总买入</span><span>{{ selectedLog.total_buy }} 股</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">总卖出</span><span>{{ selectedLog.total_sell }} 股</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">可交易数</span><span>{{ selectedLog.trade_count }} 股</span></div>
                  </div>
                  <div v-if="parseDetail(selectedLog.detail)" class="bg-white rounded-lg border border-slate-100 p-3">
                    <div class="font-semibold text-slate-600 mb-1">明细</div>
                    <pre class="whitespace-pre-wrap break-all bg-slate-50 rounded px-2 py-1.5 overflow-x-auto max-h-64 overflow-y-auto text-[10px] leading-relaxed">{{ formatDetail(selectedLog.detail) }}</pre>
                  </div>
                </template>
              </div>
              <div v-else class="flex-1 flex items-center justify-center text-xs text-slate-400">
                点击左侧日志查看详情
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 shrink-0">
        <div class="flex-1 min-w-0">
          <p v-if="configuredText" class="text-xs text-emerald-600 truncate">{{ configuredText }}</p>
          <p v-if="error" class="text-xs text-rose-500 truncate">{{ error }}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50" @click="$emit('close')">取消</button>
          <button v-if="activeSection !== 'account'" class="rounded bg-primary px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50" :disabled="saving" @click="save">{{ saving ? '保存中...' : '保存' }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { FlaskConical, Terminal, RefreshCw, Receipt, Trash2, Megaphone, ChevronUp, ChevronDown, UserRound, Cpu, Sparkles, Gauge, Eye, EyeOff, Copy, ClipboardPaste, Globe } from 'lucide-vue-next'
import { auth, authRequest, setSession, logout } from '../auth'
import { aiSettingsApi, searchApi, stockApi } from '../utils/api'
import { useSoulRingSettings, MIN_SOUL_RINGS, MAX_SOUL_RINGS } from '../composables/useSoulRingSettings'
import {
  feeConfig, toWan, applyFeeSettings,
  QUICK_FEE_OPTIONS, HUABAO_PRESETS, FEE_PRESETS_KEY,
  parseFeePresets, serializeFeePresets, newFeePresetId,
  feeExtras,
} from '../utils/feeConfig'
import {
  DEFAULT_METRIC_TIPS, METRIC_TIPS_KEY,
  parseMetricTips, serializeMetricTips, setMetricTips,
} from '../utils/metricTips'
import { BUILTIN_MODELS, buildModelGroups, buildModelOptions } from '../utils/aiModels'
import { toast } from '../utils/toast'

// 弹窗打开期间锁定背景滚动，避免滚轮/触摸滚动穿透到下层页面
let prevBodyOverflow = ''
onMounted(() => {
  prevBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.body.style.overflow = prevBodyOverflow
})

const emit = defineEmits(['close'])
const { ringCount, setRingCount } = useSoulRingSettings()
const draftRingCount = ref(ringCount.value)
const form = reactive({ agnes_api_key: '', glm_api_key: '', alapi_token: '', metaso_api_key: '', volcengine_api_key: '', tavily_api_key: '', default_model: 'agnes-2.5-flash', gold_daily_count: 50, market_fetch_interval: 30000 })
// 用户自助接入的模型（来自设置项 ai_custom_models）
const customModels = ref([])
// 从各厂商接口获取到的完整模型清单（来自设置项 ai_model_catalog），按厂商分组缓存
const catalog = ref({})
const modelOptions = computed(() => buildModelOptions(customModels.value, catalog.value))
const settingsGroups = computed(() => buildModelGroups(customModels.value, catalog.value))
const modelRoutes = reactive({ assistant: 'agnes-2.5-flash', article: 'agnes-2.5-flash', market: 'agnes-2.5-flash', life: 'agnes-2.5-flash' })
const usage = reactive({ date: '', total: null, today: null, byModel: [], trend: [] })
const saving = ref(false)
const error = ref('')
const configured = reactive({ agnes: false, glm: false, metaso: false, volcengine: false, tavily: false })
const testingModel = ref(false)
const testResult = ref('')
const testError = ref('')

// 粘贴模型文档自动接入
const docText = ref('')
const parsingDoc = ref(false)
const docError = ref('')
const docParseNote = ref('')
const parsedConfig = ref(null)
const parsedModelsText = ref('')
const parsedKey = ref('')
const savingDoc = ref(false)
const docSavedMsg = ref('')
// 从厂商接口自动拉取模型清单
const fetchingModels = ref(false)
const fetchingId = ref('')
const fetchModelsMsg = ref('')
// 模型中心：一次性获取所有厂商的模型清单
const vendorGroups = ref([])
const fetchingAll = ref(false)
const modelCenterMsg = ref('')

const VENDOR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316']
// 联网搜索里真正在跑的引擎见下面「搜索引擎降级顺序」列表（以后端 SOURCES 为准）。
// 其中需要密钥的只有三家：秘塔（默认首选）、豆包搜索（备用，额度少）、Tavily（终极兜底）；
// SearXNG / Bing / Claw / OpenSERP / DuckDuckGo 都是免密钥抓取，不需要填任何东西。
// 原先摆在这里的 Bing / Firecrawl / Serper 密钥后端从未读取，已随「以真实运行为准」清理。
const SEARCH_KEYS = [
  { id: 'metaso', field: 'metaso_api_key', label: '秘塔 Metaso', site: 'https://metaso.cn/', note: '默认首选 · 国内 AI 原生搜索，优先抓 gov.cn 官网' },
  { id: 'volcengine', field: 'volcengine_api_key', label: '豆包搜索（火山引擎）', site: 'https://console.volcengine.com/search-infinity/api-key', note: '备用 · 每月 500 次免费，额度少，不适合当主力' },
  { id: 'tavily', field: 'tavily_api_key', label: 'Tavily', site: 'https://app.tavily.com/home', note: '终极兜底 · 未填写时自动跳过这一家' }
]
// 引擎行内要就地渲染密钥输入框，因此按引擎 id 反查它的密钥字段与申请入口（免密钥的引擎查不到即不渲染）
const KEY_META = Object.fromEntries(SEARCH_KEYS.map(item => [item.id, item]))
function keyMeta(id) {
  return KEY_META[id] || null
}
// 搜索引擎降级链：顺序存进 ai_settings.search_source_order，调整后立即生效
const searchSources = ref([])
const searchOrderHint = ref('')
async function loadSearchSources() {
  try {
    const data = await searchApi.sources()
    searchSources.value = Array.isArray(data?.sources) ? data.sources : []
  } catch (_) { searchSources.value = [] }
}
async function moveSearchSource(index, delta) {
  const list = searchSources.value.slice()
  const next = index + delta
  if (next < 0 || next >= list.length) return
  const [row] = list.splice(index, 1)
  list.splice(next, 0, row)
  searchSources.value = list
  try {
    await aiSettingsApi.updateSettings({ search_source_order: JSON.stringify(list.map(item => item.id)) })
    searchOrderHint.value = '顺序已保存并生效'
  } catch (err) {
    searchOrderHint.value = '保存失败，请重试'
  }
  setTimeout(() => { searchOrderHint.value = '' }, 2400)
}

// 厂商头像：由厂商标识散列出稳定颜色，避免每次渲染变色
function vendorColor(id) {
  const text = String(id || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 997
  return VENDOR_COLORS[hash % VENDOR_COLORS.length]
}
function vendorInitial(name) {
  const text = String(name || '').trim()
  return text ? text.slice(0, 1).toUpperCase() : '?'
}

// ===== 密钥输入框：查看 / 复制 / 粘贴 + 输入后自动保存 =====
// 已保存的密钥服务端只回传「是否已配置」，不回传明文，因此查看与复制都只作用于当前输入框内容
const reveal = reactive({ agnes: false, glm: false, alapi: false, parsed: false, metaso: false, volcengine: false, tavily: false })
const keyHint = reactive({ agnes: '', glm: '', alapi: '', parsed: '', metaso: '', volcengine: '', tavily: '' })
// 自定义模型（AI 解析接入）的 Key：按 keyField 各存一份，不同厂商互不影响
const draftKeys = reactive({})
const customKeyConfigured = reactive({})
const autoSaveTimers = {}

function flashKeyHint(target, text) {
  keyHint[target] = text
  setTimeout(() => { if (keyHint[target] === text) keyHint[target] = '' }, 2600)
}

// 自定义模型的 Key 以 keyField（形如 custom_xxx_api_key）作为输入框标识
function isCustomKeyTarget(target) { return /^custom_[a-z0-9_]{1,48}_api_key$/.test(String(target)) }

function secretValue(target, propName) {
  if (target === 'parsed') return parsedKey.value
  if (isCustomKeyTarget(target)) return draftKeys[target] || ''
  return form[propName] || ''
}

function setSecretValue(target, propName, value) {
  if (target === 'parsed') { parsedKey.value = value; return }
  if (isCustomKeyTarget(target)) { draftKeys[target] = value; autoSaveCustomKey(target); return }
  form[propName] = value
  autoSaveSecret(target, propName)
}

// 输入后自动保存：只提交该字段单键，避免把弹窗里其它未保存的改动一并写入
function autoSaveSecret(target, propName) {
  clearTimeout(autoSaveTimers[target])
  autoSaveTimers[target] = setTimeout(async () => {
    const value = String(form[propName] || '').trim()
    if (!value) return
    try {
      await aiSettingsApi.updateSettings({ [propName]: value })
      configured[target] = true
      flashKeyHint(target, '已自动保存')
    } catch (_) {
      flashKeyHint(target, '自动保存失败，请点底部保存按钮重试')
    }
  }, 800)
}

// 自定义模型的 Key 自动保存：与内置厂商同一套交互，但写入各自的 keyField
function autoSaveCustomKey(keyField) {
  if (!keyField) return
  clearTimeout(autoSaveTimers[keyField])
  autoSaveTimers[keyField] = setTimeout(async () => {
    const value = String(draftKeys[keyField] || '').trim()
    if (!value) return
    try {
      await aiSettingsApi.updateSettings({ [keyField]: value })
      customKeyConfigured[keyField] = true
      flashKeyHint(keyField, '已自动保存')
    } catch (_) {
      flashKeyHint(keyField, '自动保存失败，请点底部保存按钮重试')
    }
  }, 800)
}

// 删除某个自定义模型的 Key（模型配置保留，仅清空密钥）
async function clearCustomKey(item) {
  if (!item?.keyField) return
  if (!window.confirm(`确定删除「${item.name}」的 API Key？删除后该厂商模型不可调用。`)) return
  try {
    await aiSettingsApi.updateSettings({ [item.keyField]: null })
    customKeyConfigured[item.keyField] = false
    draftKeys[item.keyField] = ''
    flashKeyHint(item.keyField, '密钥已删除')
  } catch { error.value = '删除密钥失败' }
}

async function copySecret(target, propName) {
  const value = String(secretValue(target, propName) || '').trim()
  if (!value) return flashKeyHint(target, '输入框为空，无可复制内容')
  try {
    await navigator.clipboard.writeText(value)
    flashKeyHint(target, '已复制到剪贴板')
  } catch (_) {
    flashKeyHint(target, '复制失败，请手动选择文本复制')
  }
}

async function pasteSecret(target, propName) {
  let text = ''
  try { text = await navigator.clipboard.readText() } catch (_) {
    return flashKeyHint(target, '浏览器未授权读取剪贴板，请改用 Ctrl+V 粘贴')
  }
  text = String(text || '').trim()
  if (!text) return flashKeyHint(target, '剪贴板内容为空')
  setSecretValue(target, propName, text)
  flashKeyHint(target, '已粘贴')
}

const TABS = [
  { key: 'account', label: '账号安全', icon: UserRound },
  { key: 'ai', label: 'AI 与模型', icon: Cpu },
  { key: 'appearance', label: '外观与刷新', icon: Gauge },
  { key: 'fee', label: '交易手续费', icon: Receipt },
  { key: 'tips', label: '标语库', icon: Megaphone },
  { key: 'logs', label: '运行日志', icon: Terminal },
]
const activeSection = ref('account')
const accountForm = reactive({ email: auth.user.email, currentPassword: '' })
const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const accountBusy = ref('')
const accountError = ref('')
const accountSuccess = ref('')

function clearAccountPasswords() {
  accountForm.currentPassword = ''
  passwordForm.currentPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
}

async function changeAccount() {
  if (accountBusy.value) return
  accountBusy.value = 'account'
  accountError.value = ''
  accountSuccess.value = ''
  try {
    setSession(await authRequest('account', { email: accountForm.email, currentPassword: accountForm.currentPassword }))
    accountForm.email = auth.user.email
    accountSuccess.value = '登录账号已修改；其他设备的会话已撤销。'
  } catch (failure) { accountError.value = failure.message }
  finally { clearAccountPasswords(); accountBusy.value = '' }
}

async function changePassword() {
  if (accountBusy.value) return
  accountError.value = ''
  accountSuccess.value = ''
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    accountError.value = '两次输入的新密码不一致'
    return
  }
  accountBusy.value = 'password'
  try {
    setSession(await authRequest('password', { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }))
    accountSuccess.value = '密码已修改；其他设备的会话已撤销。'
  } catch (failure) { accountError.value = failure.message }
  finally { clearAccountPasswords(); accountBusy.value = '' }
}

async function signOutAccount() {
  if (accountBusy.value) return
  accountBusy.value = 'logout'
  accountError.value = ''
  try { await logout() }
  catch (failure) { accountError.value = failure.message; accountBusy.value = '' }
}

// 交易手续费：用户可维护的档位列表，选中的档位为当前生效配置
const feePresets = ref(parseFeePresets(''))
const activeFeeId = ref(feePresets.value[0]?.id || '')
const newFee = reactive({ name: '', rateWan: 2.3, min: 5, etfRateWan: 0, etfMin: 0, cbRateShWan: 0, cbRateSzWan: 0, cbMin: 0, lofZhe: 0 })
const feeHint = ref('')
const feeHintType = ref('ok')
// 双击档位进入内联编辑
const editingId = ref(null)
const editForm = reactive({ name: '', rateWan: 0, min: 5, etfRateWan: 0, etfMin: 0, cbRateShWan: 0, cbRateSzWan: 0, cbMin: 0, lofZhe: 0 })
let editNameEl = null

const activeFee = computed(() => feePresets.value.find(p => p.id === activeFeeId.value) || null)

// 标语库：指标栏竖向轮播的标语，可增删改 + 排序
const tipList = ref([...DEFAULT_METRIC_TIPS])
const newTip = ref('')
const editingTip = ref(-1)
const editTipText = ref('')
let editTipEl = null

function addTip() {
  const t = newTip.value.trim()
  if (!t) return
  tipList.value = [...tipList.value, t]
  newTip.value = ''
}
function removeTip(i) {
  tipList.value = tipList.value.filter((_, idx) => idx !== i)
  if (editingTip.value === i) editingTip.value = -1
}
function moveTip(i, dir) {
  const j = i + dir
  if (j < 0 || j >= tipList.value.length) return
  const arr = [...tipList.value]
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  tipList.value = arr
}
function startEditTip(i) {
  editingTip.value = i
  editTipText.value = tipList.value[i]
  nextTick(() => editTipEl?.focus?.())
}
function commitTip() {
  const i = editingTip.value
  if (i < 0) return
  const t = editTipText.value.trim()
  if (t) {
    const arr = [...tipList.value]
    arr[i] = t
    tipList.value = arr
  }
  editingTip.value = -1
}
function cancelTip() { editingTip.value = -1 }
function resetTips() {
  tipList.value = [...DEFAULT_METRIC_TIPS]
  editingTip.value = -1
}

// 日志相关
const logs = ref([])
const logTotal = ref(0)
const logOffset = ref(0)
const logDetailId = ref(null)
const loadingLogs = ref(false)
const logAutoRefresh = ref(false)
let logRefreshTimer = null
const activeLogTab = ref('ai')  // 'ai' | 'tx'

const selectedLog = computed(() => {
  if (!logDetailId.value) return null
  return logs.value.find(l => l.id === logDetailId.value) || null
})

const intervalMinutes = computed(() => {
  const n = Math.max(1, Math.min(500, Number(form.gold_daily_count) || 50))
  return Math.round((15 * 60) / n)
})

const configuredText = computed(() => {
  const providers = []
  if (configured.agnes) providers.push('Agnes')
  if (configured.glm) providers.push('GLM')
  return providers.length ? `已配置：${providers.join('、')}` : ''
})

onMounted(async () => {
  try {
    const settings = await aiSettingsApi.getSettings()
    configured.agnes = Boolean(settings?.agnes_api_key_configured)
    configured.glm = Boolean(settings?.glm_api_key_configured)
    for (const item of SEARCH_KEYS) configured[item.id] = Boolean(settings?.[`${item.field}_configured`])
    loadSearchSources()
    if (settings?.gold_daily_count) {
      form.gold_daily_count = Number(settings.gold_daily_count) || 50
    }
    if (settings?.default_model) {
      form.default_model = settings.default_model
    }
    if (settings?.market_fetch_interval) {
      form.market_fetch_interval = Number(settings.market_fetch_interval) || 30000
    }
    try {
      const list = JSON.parse(settings?.ai_custom_models || '[]')
      customModels.value = Array.isArray(list) ? list.filter(item => item && typeof item === 'object') : []
    } catch (_) { customModels.value = [] }
    // 每个自定义模型的 Key 是否已配置（服务端只回传布尔值，不回传明文）
    for (const item of customModels.value) {
      if (item.keyField) customKeyConfigured[item.keyField] = Boolean(settings?.[`${item.keyField}_configured`])
    }
    try {
      const saved = JSON.parse(settings?.ai_model_catalog || '{}')
      catalog.value = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
    } catch (_) { catalog.value = {} }
    try {
      const routes = JSON.parse(settings?.ai_model_routes || '{}')
      for (const key of Object.keys(modelRoutes)) {
        if (modelOptions.value.includes(routes[key])) modelRoutes[key] = routes[key]
      }
    } catch (_) {}
    // 标语库：读取用户维护的标语列表
    tipList.value = parseMetricTips(settings?.[METRIC_TIPS_KEY])
    // 佣金档位：读取用户维护的列表，并定位当前生效档位
    feePresets.value = parseFeePresets(settings?.[FEE_PRESETS_KEY])
    const curRate = Number(settings?.stock_commission_rate)
    const curMinRaw = Number(settings?.stock_min_commission)
    const curMin = Number.isFinite(curMinRaw) ? curMinRaw : feeConfig.minCommission
    let matched = Number.isFinite(curRate) && curRate > 0
      ? feePresets.value.find(p => Math.abs(p.rate - curRate) < 1e-9 && p.min === curMin)
      : null
    if (!matched && Number.isFinite(curRate) && curRate > 0) {
      // 已生效配置不在档位列表中（如首次升级），补一条并选中
      matched = { id: newFeePresetId(), name: '当前生效', rate: curRate, min: curMin }
      feePresets.value = [...feePresets.value, matched]
    }
    activeFeeId.value = matched?.id || feePresets.value[0]?.id || ''
  } catch {
    error.value = '读取设置失败，请确认后端已启动'
  }
  // 获取 AI 调用统计
  try {
    const data = await aiSettingsApi.getUsage()
    usage.date = data.date
    usage.total = data.total
    usage.today = data.today ?? data.total  // 兼容旧接口
    usage.byModel = data.byModel
    usage.trend = data.trend || []
  } catch (_) { /* 静默失败 */ }
  // 获取 AI 调用日志
  fetchLogs()
})

onUnmounted(() => {
  stopLogAutoRefresh()
})

function flashFeeHint(msg, type = 'ok') {
  feeHint.value = msg
  feeHintType.value = type
}

// 从表单字段生成档位对象（费率万→小数、折扣折→小数）
function buildPreset(name, f) {
  const rate = (Number(f.rateWan) || 0) / 10000
  const min = Math.max(0, Number(f.min) || 0)
  return {
    name,
    rate,
    min,
    etfRate: (Number(f.etfRateWan) || 0) / 10000,
    etfMin: Math.max(0, Number(f.etfMin) || 0),
    cbRateSh: (Number(f.cbRateShWan) || 0) / 10000,
    cbRateSz: (Number(f.cbRateSzWan) || 0) / 10000,
    cbMin: Math.max(0, Number(f.cbMin) || 0),
    lofDiscount: (Number(f.lofZhe) || 0) / 10,
  }
}

function addFeePreset() {
  const rate = (Number(newFee.rateWan) || 0) / 10000
  if (!(rate > 0)) {
    flashFeeHint('请填写大于 0 的股票佣金费率', 'error')
    return
  }
  const min = Math.max(0, Number(newFee.min) || 0)
  const name = String(newFee.name || '').trim() || `万${toWan(rate)} · 最低${min}元`
  const dup = feePresets.value.find(p => Math.abs(p.rate - rate) < 1e-9 && p.min === min)
  if (dup) {
    activeFeeId.value = dup.id
    flashFeeHint(`已存在相同档位「${dup.name}」，已选中`)
    return
  }
  const item = { id: newFeePresetId(), ...buildPreset(name, newFee) }
  feePresets.value = [...feePresets.value, item]
  activeFeeId.value = item.id
  newFee.name = ''
  newFee.etfRateWan = 0
  newFee.etfMin = 0
  newFee.cbRateShWan = 0
  newFee.cbRateSzWan = 0
  newFee.cbMin = 0
  newFee.lofZhe = 0
  flashFeeHint(`已新增档位「${name}」，保存后生效`)
}

function quickAddFee(opt) {
  const min = 5
  const dup = feePresets.value.find(p => Math.abs(p.rate - opt.rate) < 1e-9 && p.min === min)
  if (dup) {
    activeFeeId.value = dup.id
    flashFeeHint(`「${dup.name}」已在列表中，已选中`)
    return
  }
  const name = `${opt.label} · 最低${min}元`
  const item = { id: newFeePresetId(), name, rate: opt.rate, min }
  feePresets.value = [...feePresets.value, item]
  activeFeeId.value = item.id
  flashFeeHint(`已新增档位「${name}」，保存后生效`)
}

function quickAddHuabao(h) {
  const dup = feePresets.value.find(p => p.name === h.name)
  if (dup) {
    activeFeeId.value = dup.id
    flashFeeHint(`「${dup.name}」已在列表中，已选中`)
    return
  }
  const item = { id: newFeePresetId(), ...h }
  feePresets.value = [...feePresets.value, item]
  activeFeeId.value = item.id
  flashFeeHint(`已新增档位「${h.name}」，保存后生效`)
}

function removeFeePreset(id) {
  const list = feePresets.value.filter(p => p.id !== id)
  if (!list.length) {
    flashFeeHint('至少保留一个档位', 'error')
    return
  }
  feePresets.value = list
  if (activeFeeId.value === id) activeFeeId.value = list[0].id
  if (editingId.value === id) editingId.value = null
  flashFeeHint('已删除档位，保存后生效')
}

// 双击档位卡片进入编辑态，自动聚焦名称并全选
function startEdit(p) {
  editingId.value = p.id
  editForm.name = p.name
  editForm.rateWan = toWan(p.rate)
  editForm.min = p.min
  editForm.etfRateWan = p.etfRate ? toWan(p.etfRate) : 0
  editForm.etfMin = p.etfMin || 0
  editForm.cbRateShWan = p.cbRateSh ? toWan(p.cbRateSh) : 0
  editForm.cbRateSzWan = p.cbRateSz ? toWan(p.cbRateSz) : 0
  editForm.cbMin = p.cbMin || 0
  editForm.lofZhe = p.lofDiscount ? p.lofDiscount * 10 : 0
  nextTick(() => {
    editNameEl?.focus?.()
    editNameEl?.select?.()
  })
}

function cancelEdit() {
  editingId.value = null
}

function commitEdit() {
  const id = editingId.value
  if (!id) return
  const rate = (Number(editForm.rateWan) || 0) / 10000
  const min = Math.max(0, Number(editForm.min) || 0)
  if (!(rate > 0)) {
    flashFeeHint('请填写大于 0 的股票佣金费率', 'error')
    return
  }
  const name = String(editForm.name || '').trim() || `万${toWan(rate)} · 最低${min}元`
  const dup = feePresets.value.find(p => p.id !== id && Math.abs(p.rate - rate) < 1e-9 && p.min === min)
  if (dup) {
    flashFeeHint(`已存在相同档位「${dup.name}」`, 'error')
    return
  }
  const next = buildPreset(name, editForm)
  feePresets.value = feePresets.value.map(p => (p.id === id ? { ...next, id } : p))
  editingId.value = null
  flashFeeHint(`已更新档位「${name}」，保存后生效`)
}

function selectLogDetail(id) {
  logDetailId.value = logDetailId.value === id ? null : id
}

function trendBarHeight(count) {
  if (!count) return 4 // 最小值留个细线
  const max = Math.max(...usage.trend.map(d => d.count), 1)
  return Math.max(4, (count / max) * 100)
}
// MySQL DATETIME(3) 形如 "YYYY-MM-DD HH:mm:ss.SSS"，无时区标识。
// 用 new Date(字符串) 解析在不同浏览器上行为不一致（Safari 直接 Invalid Date），
// 这里按本地时间显式解析，避免时区歧义。
function parseLogTime(str) {
  if (!str) return null
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/)
  if (!m) return null
  const ms = m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), ms)
}
function formatLogTime(str) {
  const d = parseLogTime(str)
  if (!d || isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${md} ${hm}`
}
function formatLogFull(str) {
  const d = parseLogTime(str)
  if (!d || isNaN(d.getTime())) return str || ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function fetchLogs() {
  loadingLogs.value = true
  logOffset.value = 0
  logDetailId.value = null
  try {
    const data = activeLogTab.value === 'ai'
      ? await aiSettingsApi.getLogs({ limit: 50, offset: 0 })
      : await stockApi.getTxLogs({ limit: 50, offset: 0 })
    logs.value = data.logs || []
    logTotal.value = data.total || 0
  } catch (_) {
    /* 静默失败 */
  } finally {
    loadingLogs.value = false
  }
}

async function loadMoreLogs() {
  if (loadingLogs.value) return
  loadingLogs.value = true
  logOffset.value = logs.value.length
  try {
    const data = activeLogTab.value === 'ai'
      ? await aiSettingsApi.getLogs({ limit: 50, offset: logOffset.value })
      : await stockApi.getTxLogs({ limit: 50, offset: logOffset.value })
    if (data.logs?.length) {
      logs.value = [...logs.value, ...data.logs]
    }
  } catch (_) {
    /* 静默失败 */
  } finally {
    loadingLogs.value = false
  }
}

function switchLogTab(tab) {
  if (activeLogTab.value === tab) return
  activeLogTab.value = tab
  fetchLogs()
}

// 交易日志 detail 字段是 JSON 字符串，解析后用于 v-if 判断和格式化展示
function parseDetail(raw) {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    return obj && typeof obj === 'object' && Object.keys(obj).length ? obj : null
  } catch (_) {
    return null
  }
}

function formatDetail(raw) {
  const obj = parseDetail(raw)
  if (!obj) return ''
  return JSON.stringify(obj, null, 2)
}

function toggleAutoRefresh() {
  logAutoRefresh.value = !logAutoRefresh.value
  if (logAutoRefresh.value) {
    startLogAutoRefresh()
  } else {
    stopLogAutoRefresh()
  }
}

function startLogAutoRefresh() {
  stopLogAutoRefresh()
  logRefreshTimer = setInterval(() => {
    fetchLogs()
  }, 5000)
}

function stopLogAutoRefresh() {
  if (logRefreshTimer) {
    clearInterval(logRefreshTimer)
    logRefreshTimer = null
  }
}

async function save() {
  const payload = Object.fromEntries(
    Object.entries(form).filter(([key, value]) => {
      if (key === 'gold_daily_count') return true
      if (key === 'market_fetch_interval') return true
      return String(value).trim()
    })
  )
  payload.gold_daily_count = String(Math.max(1, Math.min(500, Number(form.gold_daily_count) || 50)))
  payload.market_fetch_interval = String(form.market_fetch_interval || 30000)
  // 佣金档位：持久化整份列表 + 当前选中档位的生效值
  payload[FEE_PRESETS_KEY] = serializeFeePresets(feePresets.value)
  // 标语库：持久化整份标语列表（为空时回退默认）
  payload[METRIC_TIPS_KEY] = serializeMetricTips(tipList.value)
  const fee = activeFee.value
  payload.stock_commission_rate = String(fee && fee.rate > 0 ? fee.rate : feeConfig.commissionRate)
  payload.stock_min_commission = String(fee ? Math.max(0, Number(fee.min) || 0) : feeConfig.minCommission)
  payload.ai_model_routes = JSON.stringify({ ...modelRoutes })
  saving.value = true
  error.value = ''
  try {
    await aiSettingsApi.updateSettings(payload)
    setRingCount(draftRingCount.value)
    applyFeeSettings(payload)
    setMetricTips(parseMetricTips(payload[METRIC_TIPS_KEY]))
    emit('close')
  } catch {
    error.value = '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

// 模型预览测试：用当前配置的 API Key 和选择的模型发送"你好"
async function testModel() {
  testingModel.value = true
  testResult.value = ''
  testError.value = ''
  try {
    const res = await aiSettingsApi.testModel({
      model: form.default_model,
      agnes_api_key: form.agnes_api_key,
      glm_api_key: form.glm_api_key,
      message: '你好',
    })
    testResult.value = res?.result || res?.reply || res?.content || JSON.stringify(res)
    form.agnes_api_key = ''
    form.glm_api_key = ''
  } catch (err) {
    testError.value = err.response?.data?.error || err.response?.data?.message || '测试失败，请检查 API Key 和模型配置'
  } finally {
    testingModel.value = false
  }
}

// 解析用户粘贴的模型文档，生成接入配置预览
async function parseModelDoc() {
  if (parsingDoc.value) return
  const text = docText.value.trim()
  docError.value = ''
  docParseNote.value = ''
  docSavedMsg.value = ''
  parsedConfig.value = null
  if (!text) { docError.value = '请先粘贴模型文档内容'; return }
  parsingDoc.value = true
  try {
    const data = await aiSettingsApi.parseModelDoc({ text })
    const config = data?.config || {}
    parsedConfig.value = {
      id: config.id || '',
      name: config.name || '',
      baseUrl: config.baseUrl || '',
      path: config.path || '/chat/completions',
      authStyle: config.authStyle === 'x-api-key' ? 'x-api-key' : 'bearer',
      apiStyle: config.apiStyle === 'anthropic' ? 'anthropic' : 'openai',
      keyField: config.keyField || '',
    }
    parsedModelsText.value = Array.isArray(config.models) ? config.models.join(', ') : ''
    parsedKey.value = ''
    const notes = Array.isArray(data?.notes) ? data.notes.filter(Boolean) : []
    docParseNote.value = `${data?.source === 'ai' ? 'AI 解析完成' : '规则解析完成'}${notes.length ? `：${notes.join('；')}` : ''}`
  } catch (err) {
    docError.value = err.response?.data?.error || '解析失败，请检查文档内容'
  } finally {
    parsingDoc.value = false
  }
}

// 保存接入：写入自定义模型列表与对应密钥
async function saveParsedModel() {
  const cfg = parsedConfig.value
  if (!cfg || savingDoc.value) return
  docError.value = ''
  docSavedMsg.value = ''
  const models = parsedModelsText.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  if (!cfg.baseUrl.trim()) { docError.value = '请填写 Base URL'; return }
  if (!models.length) { docError.value = '请填写至少一个模型名称'; return }
  if (!cfg.keyField) { docError.value = '配置标识缺失，请重新解析'; return }
  savingDoc.value = true
  try {
    const entry = {
      id: cfg.id || `custom-${cfg.keyField.replace(/^custom_|_api_key$/g, '')}`,
      name: cfg.name.trim() || models[0],
      baseUrl: cfg.baseUrl.trim().replace(/\/+$/, ''),
      path: cfg.path.trim() || '/chat/completions',
      authStyle: cfg.authStyle,
      apiStyle: cfg.apiStyle,
      models,
      keyField: cfg.keyField,
    }
    const list = customModels.value.filter(m => m.id !== entry.id)
    list.push(entry)
    const payload = { ai_custom_models: JSON.stringify(list) }
    const key = parsedKey.value.trim()
    if (key) payload[entry.keyField] = key
    await aiSettingsApi.updateSettings(payload)
    customModels.value = list
    if (key && entry.keyField) customKeyConfigured[entry.keyField] = true
    parsedKey.value = ''
    docSavedMsg.value = `已接入「${entry.name}」，可在上方模型分配中选用`
  } catch (err) {
    docError.value = err.response?.data?.error || '保存失败，请稍后重试'
  } finally {
    savingDoc.value = false
  }
}

// 按厂商接口自动获取模型清单：Base URL + 认证方式一致即可通用
async function requestModels(cfg, key) {
  const result = await aiSettingsApi.fetchModels({
    baseUrl: cfg.baseUrl,
    path: cfg.path,
    authStyle: cfg.authStyle,
    apiStyle: cfg.apiStyle,
    keyField: cfg.keyField,
    apiKey: key || '',
  })
  return result.models || []
}

// 解析面板：一键获取模型 ID，填入输入框后即可保存接入
async function fetchParsedModels() {
  const cfg = parsedConfig.value
  if (!cfg || fetchingModels.value) return
  docError.value = ''
  fetchModelsMsg.value = ''
  if (!cfg.baseUrl.trim()) { docError.value = '请先填写 Base URL'; return }
  if (!cfg.keyField) { docError.value = '配置标识缺失，请重新解析文档'; return }
  fetchingModels.value = true
  try {
    const models = await requestModels(cfg, parsedKey.value.trim())
    parsedModelsText.value = models.join(', ')
    fetchModelsMsg.value = `已获取 ${models.length} 个模型，可直接保存接入`
  } catch (err) {
    docError.value = err.response?.data?.error || '获取模型列表失败'
  } finally {
    fetchingModels.value = false
  }
}

// 已接入条目：刷新其模型清单（厂商上线新模型后可一键同步）
async function refreshCustomModel(item) {
  if (!item || fetchingId.value) return
  docError.value = ''
  fetchModelsMsg.value = ''
  fetchingId.value = item.id
  try {
    const key = parsedConfig.value?.id === item.id ? parsedKey.value.trim() : ''
    const models = await requestModels(item, key)
    if (!models.length) throw new Error('接口未返回可识别的模型')
    // 读-改-写：只更新该条目的 models，保留其它接入配置与已分配的模型路由
    const list = customModels.value.map(m => (m.id === item.id ? { ...m, models } : m))
    await aiSettingsApi.updateSettings({ ai_custom_models: JSON.stringify(list) })
    customModels.value = list
    // 原先分配的模型若已下线，回退到仍可用的模型，避免继续报 401/404
    for (const routeKey of Object.keys(modelRoutes)) {
      if (!modelOptions.value.includes(modelRoutes[routeKey])) modelRoutes[routeKey] = modelOptions.value[0] || BUILTIN_MODELS[0]
    }
    if (!modelOptions.value.includes(form.default_model)) form.default_model = modelOptions.value[0] || BUILTIN_MODELS[0]
    fetchModelsMsg.value = `「${item.name}」已刷新为 ${models.length} 个模型`
  } catch (err) {
    docError.value = err.response?.data?.error || err.message || '刷新模型列表失败'
  } finally {
    fetchingId.value = ''
  }
}

// 一键获取所有已配置厂商的模型清单，按厂商分组展示并缓存到设置
async function fetchAllVendorModels() {
  if (fetchingAll.value) return
  fetchingAll.value = true
  modelCenterMsg.value = ''
  try {
    const result = await aiSettingsApi.fetchAllModels()
    const groups = Array.isArray(result?.groups) ? result.groups : []
    vendorGroups.value = groups
    // 读-改-写：把成功获取的清单并入缓存，供下方模型分配的分组下拉使用
    const next = { ...catalog.value }
    for (const group of groups) {
      if (group.ok && group.models.length) next[group.id] = { name: group.name, kind: group.kind, models: group.models }
    }
    catalog.value = next
    await aiSettingsApi.updateSettings({ ai_model_catalog: JSON.stringify(next) })
    const okCount = groups.filter(group => group.ok).length
    const failed = groups.length - okCount
    modelCenterMsg.value = `获取完成：${okCount} 个厂商共 ${result?.totalModels ?? 0} 个模型${failed ? `；${failed} 个厂商未取到（多为未配置 Key 或该厂商不提供模型清单接口）` : ''}`
    // 已分配的模型若不在清单内则回退，避免继续调用报错
    for (const routeKey of Object.keys(modelRoutes)) {
      if (!modelOptions.value.includes(modelRoutes[routeKey])) modelRoutes[routeKey] = modelOptions.value[0] || BUILTIN_MODELS[0]
    }
    if (!modelOptions.value.includes(form.default_model)) form.default_model = modelOptions.value[0] || BUILTIN_MODELS[0]
  } catch (err) {
    modelCenterMsg.value = err.response?.data?.error || '获取失败，请稍后重试'
  } finally {
    fetchingAll.value = false
  }
}

// 移除已接入的自定义模型（同时删除其密钥）
async function removeCustomModel(id) {
  const target = customModels.value.find(m => m.id === id)
  if (!target) return
  if (!window.confirm(`确定移除「${target.name}」？移除后其 API Key 同时删除。`)) return
  const list = customModels.value.filter(m => m.id !== id)
  const payload = { ai_custom_models: JSON.stringify(list) }
  if (target.keyField) payload[target.keyField] = null
  try {
    await aiSettingsApi.updateSettings(payload)
    customModels.value = list
    if (target.keyField) {
      customKeyConfigured[target.keyField] = false
      draftKeys[target.keyField] = ''
    }
    for (const key of Object.keys(modelRoutes)) {
      if (!modelOptions.value.includes(modelRoutes[key])) modelRoutes[key] = BUILTIN_MODELS[0]
    }
    if (!modelOptions.value.includes(form.default_model)) form.default_model = BUILTIN_MODELS[0]
    docSavedMsg.value = `已移除「${target.name}」`
  } catch { docError.value = '移除失败，请稍后重试' }
}

async function clearKey(field) {
  if (!window.confirm('确定删除该密钥？删除后相关功能不可调用，直到重新配置。')) return
  try {
    await aiSettingsApi.updateSettings({ [field]: null })
    form[field] = ''
    if (field === 'agnes_api_key') configured.agnes = false
    if (field === 'glm_api_key') configured.glm = false
  } catch { error.value = '删除密钥失败' }
}
</script>
