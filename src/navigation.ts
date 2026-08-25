import { BarChart3, ChartPie, House, ListChecks, ReceiptText, Repeat2, Sparkles, TrendingUp, UserRound, Wallet, type LucideIcon } from 'lucide-react'

export interface NavDestination { to: string; label: string; icon: LucideIcon }

export const NAV_DESTINATIONS: NavDestination[] = [
  { to: '/transactions', label: 'Transações', icon: ReceiptText },
  { to: '/organizar', label: 'Organizar', icon: ListChecks },
  { to: '/planning', label: 'Orçamento', icon: ChartPie },
  { to: '/charts', label: 'Gráficos', icon: BarChart3 },
  { to: '/recurring', label: 'Recorrentes', icon: Repeat2 },
  { to: '/forecast', label: 'Previsão', icon: TrendingUp },
  { to: '/accounts', label: 'Contas', icon: Wallet },
  { to: '/assistant', label: 'Assistente', icon: Sparkles },
]

export const HOME_ITEM: NavDestination = { to: '/', label: 'Início', icon: House }
export const PROFILE_ITEM: NavDestination = { to: '/profile', label: 'Perfil', icon: UserRound }
export const APP_PAGES: NavDestination[] = [HOME_ITEM, ...NAV_DESTINATIONS, PROFILE_ITEM]

export const MAX_SHORTCUTS = 2
export const DEFAULT_SHORTCUTS = ['/transactions', '/organizar']

export function sanitizeShortcuts(value: unknown): string[] {
  const known = new Set(NAV_DESTINATIONS.map(destination => destination.to))
  const picked = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && known.has(item)) : []
  const filled = [...new Set(picked)]
  for (const fallback of DEFAULT_SHORTCUTS) {
    if (filled.length >= MAX_SHORTCUTS) break
    if (!filled.includes(fallback)) filled.push(fallback)
  }
  return filled.slice(0, MAX_SHORTCUTS)
}

export function resolveShortcutItems(shortcuts: unknown): NavDestination[] {
  const safe = sanitizeShortcuts(shortcuts)
  return [HOME_ITEM, ...safe.map(to => NAV_DESTINATIONS.find(destination => destination.to === to)!), PROFILE_ITEM]
}
