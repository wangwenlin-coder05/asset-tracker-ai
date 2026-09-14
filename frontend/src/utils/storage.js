export const storage = {
  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key)
      if (value === null) return defaultValue
      return JSON.parse(value)
    } catch {
      return defaultValue
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  },
  clear() {
    try {
      localStorage.clear()
      return true
    } catch {
      return false
    }
  }
}
