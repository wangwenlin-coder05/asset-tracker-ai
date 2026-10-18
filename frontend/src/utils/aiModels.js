// 内置可选模型与模型清单构建：设置面板与各业务板块共用同一份，避免多处硬编码产生漂移
export const BUILTIN_MODELS = ['agnes-2.5-flash', 'agnes-2.0-flash', 'glm-4-flash-250414', 'glm-4.6v']

// 模型清单分组：内置厂商、用户自助接入的厂商、以及从接口发现并缓存的厂商
// 返回 [{ id, name, kind, models }]，用于按厂商分类展示与下拉分组
export function buildModelGroups(customModels, catalog) {
  const groups = []

  // 用户自助接入的厂商（自带 name 与 models）
  for (const item of Array.isArray(customModels) ? customModels : []) {
    if (!item || typeof item !== 'object') continue
    groups.push({
      id: item.id || item.name,
      name: item.name || item.id || '自定义厂商',
      kind: 'custom',
      models: (Array.isArray(item.models) ? item.models : []).filter(Boolean)
    })
  }

  // 从接口发现并缓存的结果（含内置厂商与自定义厂商的完整清单）
  for (const [id, entry] of Object.entries(catalog && typeof catalog === 'object' ? catalog : {})) {
    const models = (Array.isArray(entry?.models) ? entry.models : []).filter(Boolean)
    if (!models.length) continue
    const exists = groups.find(group => group.id === id)
    if (exists) {
      exists.models = [...new Set([...exists.models, ...models])]
      continue
    }
    groups.push({ id, name: entry?.name || id, kind: entry?.kind || 'discovered', models })
  }

  // 内置备用清单：只在其它来源都没有该模型时作为兜底，避免下拉为空
  const covered = new Set(groups.flatMap(group => group.models))
  const fallback = BUILTIN_MODELS.filter(model => !covered.has(model))
  if (fallback.length) groups.push({ id: 'builtin', name: '内置', kind: 'builtin', models: fallback })

  return groups.filter(group => group.models.length)
}

// 扁平化清单：兼容旧调用方（设置面板下拉、人生规划板块等）
export function buildModelOptions(customModels, catalog) {
  return [...new Set(buildModelGroups(customModels, catalog).flatMap(group => group.models))]
}
