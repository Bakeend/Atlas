export type DashboardWidgetKey =
  | 'balance'
  | 'summary'
  | 'daily-spend'
  | 'free-money'
  | 'chart'
  | 'budget'
  | 'recent'

export interface DashboardWidgetPreference {
  key: DashboardWidgetKey
  visible: boolean
}

export const DASHBOARD_WIDGETS: ReadonlyArray<{
  key: DashboardWidgetKey
  label: string
  description: string
}> = [
  { key: 'balance', label: 'Saldo total', description: 'Saldo consolidado de todas as contas ativas.' },
  { key: 'summary', label: 'Receitas e despesas', description: 'Resumo do mês atual.' },
  { key: 'daily-spend', label: 'Quanto posso gastar hoje?', description: 'Valor diário seguro para gastar.' },
  { key: 'free-money', label: 'Dinheiro livre', description: 'Valor disponível após os compromissos.' },
  { key: 'chart', label: 'Gráfico de despesas', description: 'Evolução das despesas ao longo dos meses.' },
  { key: 'budget', label: 'Orçamento mensal', description: 'Consumo dos limites por categoria.' },
  { key: 'recent', label: 'Transações recentes', description: 'Últimas movimentações registradas.' },
]

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetPreference[] = DASHBOARD_WIDGETS.map(widget => ({
  key: widget.key,
  visible: true,
}))

export function sanitizeDashboardWidgets(value: unknown): DashboardWidgetPreference[] | undefined {
  if (!Array.isArray(value)) return undefined
  const preferences: DashboardWidgetPreference[] = []
  const seen = new Set<DashboardWidgetKey>()
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const source = item as Record<string, unknown>
    const key = source.key as DashboardWidgetKey
    if (DASHBOARD_WIDGETS.some(widget => widget.key === key) && typeof source.visible === 'boolean' && !seen.has(key)) {
      preferences.push({ key, visible: source.visible })
      seen.add(key)
    }
  }
  if (!preferences.length) return undefined
  return [...preferences, ...DASHBOARD_WIDGETS.filter(widget => !seen.has(widget.key)).map(widget => ({ key: widget.key, visible: true }))]
}
