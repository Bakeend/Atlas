export type ThemePreference = 'system' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'atlas-theme-preference'

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(preference = getThemePreference()) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
}

export function setThemePreference(preference: ThemePreference) {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  applyTheme(preference)
}

export function initializeThemeSync() {
  if (typeof window === 'undefined') return () => undefined
  applyTheme()
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const syncSystemTheme = () => {
    if (getThemePreference() === 'system') applyTheme('system')
  }
  media.addEventListener('change', syncSystemTheme)
  return () => media.removeEventListener('change', syncSystemTheme)
}
