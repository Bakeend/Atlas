import { getThemePreference, resolveTheme as resolveLocalTheme } from "../theme"
import { useEffect, useState } from "react"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

const THEME_COLOR_LIGHT = "#F7F8FA"
const THEME_COLOR_DARK = "#0F172A"
let currentTheme: Theme = "system"

function getSystemResolved(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return getSystemResolved()
  return theme as ResolvedTheme
}

function updateMetaThemeColor(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return
  const meta = document.querySelector("meta[name=\"theme-color\"]") as HTMLMetaElement | null
  if (meta) meta.content = resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
}

function applyClass(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
}

export function syncTheme(theme: Theme): ResolvedTheme {
  currentTheme = theme
  const resolved: ResolvedTheme = theme === "system" ? getSystemResolved() : (theme as ResolvedTheme)
  applyClass(resolved)
  updateMetaThemeColor(resolved)
  try { localStorage.setItem("atlas-theme", theme) } catch {}
  return resolved
}

export function initThemeSync(): ResolvedTheme {
  let cached: string | null = null
  try { cached = localStorage.getItem("atlas-theme") } catch { cached = null }
  const valid: Theme[] = ["light", "dark", "system"]
  const initial: Theme = cached && (valid as string[]).includes(cached) ? (cached as Theme) : "system"
  return syncTheme(initial)
}

export function getCurrentTheme(): Theme { return currentTheme }
export function getResolvedTheme(): ResolvedTheme { return resolveTheme(currentTheme) }
export function isDarkResolved(): boolean { return getResolvedTheme() === "dark" }

export function useResolvedTheme(): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const pref = getThemePreference()
    return resolveLocalTheme(pref)
  })
  useEffect(() => {
    const handler = () => {
      const pref = getThemePreference()
      setResolved(resolveLocalTheme(pref))
    }
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const mediaHandler = () => {
      if (getThemePreference() === "system") setResolved(mq.matches ? "dark" : "light")
    }
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", mediaHandler)
    else (mq as any).addListener(mediaHandler)
    window.addEventListener("storage", handler)
    const obs = typeof MutationObserver !== "undefined" && typeof document !== "undefined"
      ? new MutationObserver(() => {
          setResolved(document.documentElement.classList.contains("dark") ? "dark" : "light")
        })
      : null
    if (obs && typeof document !== "undefined") obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", mediaHandler)
      else (mq as any).removeListener(mediaHandler)
      window.removeEventListener("storage", handler)
      if (obs) obs.disconnect()
    }
  }, [])
  return resolved
}
