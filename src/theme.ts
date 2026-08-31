export type ThemePreference = 'system' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'atlas-theme-preference'
const LIGHT_ICON = '/icons/%E2%94%9C%C2%A1cone_azul_minimalista_em_forma_de_arco.png'
const DARK_ICON = '/icons/logotipo_azul_abstrato_em_fundo_escuro.png'

function syncThemeAssets(theme: 'light' | 'dark') {
  const icon = theme === 'dark' ? DARK_ICON : LIGHT_ICON
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
    link.href = icon
  })
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B1220' : '#2F80ED')
}

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(preference = getThemePreference()) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
  syncThemeAssets(resolved)
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
  const syncSavedPreference = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) applyTheme()
  }
  media.addEventListener('change', syncSystemTheme)
  window.addEventListener('storage', syncSavedPreference)
  return () => {
    media.removeEventListener('change', syncSystemTheme)
    window.removeEventListener('storage', syncSavedPreference)
  }
}
