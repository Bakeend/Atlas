import type { Theme } from '../domain'

const STORAGE_KEY = 'atlas-theme'
const THEME_COLOR_LIGHT = '#F7F8FA'
const THEME_COLOR_DARK = '#0F172A'

export type ResolvedTheme = 'light' | 'dark'

let mediaQuery: MediaQueryList | null = null
let currentTheme: Theme = 'system'
let listenerAttached = false

function getSystemResolved(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') return getSystemResolved()
  return theme
}

function updateMetaThemeColor(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (meta) meta.content = resolved === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
}

function applyClass(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  // para suporte a CSS color-scheme (scrollbar nativa)
  root.style.colorScheme = resolved
}

export function syncTheme(theme: Theme): ResolvedTheme {
  currentTheme = theme
  const resolved = resolveTheme(theme)
  applyClass(resolved)
  updateMetaThemeColor(resolved)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore
  }
  ensureMediaListener()
  return resolved
}

function ensureMediaListener(): void {
  if (listenerAttached || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (currentTheme === 'system') {
      const resolved = getSystemResolved()
      applyClass(resolved)
      updateMetaThemeColor(resolved)
    }
  }
  // Safari <14 usa addListener
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handler)
  } else {
    mediaQuery.addListener(handler)
  }
  listenerAttached = true
}

export function initThemeSync(): ResolvedTheme {
  let cached: string | null = null
  try {
    cached = localStorage.getItem(STORAGE_KEY)
  } catch {
    cached = null
  }
  const valid: Theme[] = ['light', 'dark', 'system']
  const initial: Theme = cached && (valid as string[]).includes(cached) ? (cached as Theme) : 'system'
  return syncTheme(initial)
}

export function getCurrentTheme(): Theme {
  return currentTheme
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme(currentTheme)
}

export function isDarkResolved(): boolean {
  return getResolvedTheme() === 'dark'
}

// Hook para componentes React — reage a mudanças de tema e de prefers-color-scheme
import { useEffect, useState } from 'react'
import { useFinanceStore } from '../store'

export function useResolvedTheme(): ResolvedTheme {
  const storeTheme = useFinanceStore(state => state.theme) as Theme | undefined
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const t: Theme = storeTheme ?? currentTheme
    return resolveTheme(t)
  })

  useEffect(() => {
    const t: Theme = storeTheme ?? currentTheme
    setResolved(resolveTheme(t))
  }, [storeTheme])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const t: Theme = useFinanceStore.getState().theme ?? currentTheme
      if (t === 'system') setResolved(mq.matches ? 'dark' : 'light')
    }
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])

  // também reage a mudanças diretas de classe (syncTheme via store)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() => {
      setResolved(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  return resolved
}
