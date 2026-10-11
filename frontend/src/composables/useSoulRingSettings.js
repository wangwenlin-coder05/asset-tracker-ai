import { ref, readonly } from 'vue'

const STORAGE_KEY = 'deposit_reservoir_ring_count'
export const MIN_SOUL_RINGS = 1
export const MAX_SOUL_RINGS = 8

function normalizeCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0
    ? Math.min(MAX_SOUL_RINGS, Math.max(MIN_SOUL_RINGS, Math.round(count)))
    : 4
}

const ringCount = ref(normalizeCount(localStorage.getItem(STORAGE_KEY)))

export function useSoulRingSettings() {
  function setRingCount(value) {
    const count = normalizeCount(value)
    localStorage.setItem(STORAGE_KEY, String(count))
    ringCount.value = count
  }

  return { ringCount: readonly(ringCount), setRingCount }
}
