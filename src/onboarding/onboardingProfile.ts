import type {
  FinanceData,
  FinancialProfile,
  IncomePattern,
  OnboardingCompletionInput,
  OrganizationLevel,
  PreferredFeatures,
  PrimaryGoal,
} from '../domain'

export type DashboardCardKey = 'daily-spend' | 'free-money' | 'chart' | 'budget' | 'recent'

export const PRIMARY_GOALS: PrimaryGoal[] = ['organize', 'reduce-spending', 'save', 'debt', 'safe-spend', 'tracking']
export const INCOME_PATTERNS: IncomePattern[] = ['fixed', 'variable', 'multiple', 'unknown']
export const ORGANIZATION_LEVELS: OrganizationLevel[] = ['tracking', 'guided', 'assisted', 'automatic']

export const PRIORITY_VALUES = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Dívidas', 'Reserva', 'Metas', 'Lazer'] as const

const DEFAULT_DASHBOARD: DashboardCardKey[] = ['chart', 'budget', 'recent']
const LEAN_DASHBOARD: DashboardCardKey[] = ['budget', 'recent']

function sanitizeStringArray(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))]
}

function sanitizeBooleans(value: unknown): Partial<PreferredFeatures> {
  if (typeof value !== 'object' || value === null) return {}
  const source = value as Record<string, unknown>
  const result: Partial<PreferredFeatures> = {}
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'boolean') result[key as keyof PreferredFeatures] = source[key] as boolean
  }
  return result
}

export function derivePreferredFeatures(input: {
  primaryGoal: PrimaryGoal
  difficulties: string[]
  priorities: string[]
  organizationLevel: OrganizationLevel
}): PreferredFeatures {
  const { primaryGoal, difficulties, priorities, organizationLevel } = input
  const features: PreferredFeatures = {
    freeMoney: false,
    dailySpend: false,
    recurring: false,
    budgets: false,
    goals: false,
    alerts: false,
    aiPlanning: organizationLevel === 'assisted' || organizationLevel === 'automatic',
    forecast: false,
  }
  switch (primaryGoal) {
    case 'safe-spend':
      features.dailySpend = true
      features.freeMoney = true
      features.alerts = true
      break
    case 'save':
      features.goals = true
      features.freeMoney = true
      break
    case 'debt':
      features.recurring = true
      features.budgets = true
      features.forecast = true
      break
    case 'reduce-spending':
      features.dailySpend = true
      features.budgets = true
      features.alerts = true
      break
    case 'organize':
      features.recurring = true
      features.budgets = true
      features.alerts = true
      break
    case 'tracking':
      break
  }
  if (difficulties.includes('daily-overspend')) features.dailySpend = true
  if (difficulties.includes('hard-to-save')) features.freeMoney = true
  if (difficulties.includes('forget-due-dates')) features.recurring = true
  if (priorities.includes('Reserva')) { features.goals = true; features.freeMoney = true }
  if (priorities.includes('Dívidas')) { features.recurring = true; features.forecast = true }
  return features
}

// Fonte única de verdade para perfil ausente/corrompido — usuários antigos continuam no dashboard padrão.
export function getEffectiveFinancialProfile(data: { financialProfile?: unknown }): FinancialProfile | undefined {
  return sanitizeFinancialProfile(data.financialProfile)
}

export function sanitizeFinancialProfile(value: unknown): FinancialProfile | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Record<string, unknown>
  const primaryGoal = PRIMARY_GOALS.find(goal => goal === raw.primaryGoal)
  if (!primaryGoal) return undefined
  const incomePattern = INCOME_PATTERNS.find(pattern => pattern === raw.incomePattern) ?? 'unknown'
  const organizationLevel = ORGANIZATION_LEVELS.find(level => level === raw.organizationLevel) ?? 'guided'
  const difficulties = sanitizeStringArray(raw.difficulties, ['no-clue', 'daily-overspend', 'many-bills', 'forget-due-dates', 'hard-to-save', 'variable-income', 'card-control'])
  const priorities = sanitizeStringArray(raw.priorities, PRIORITY_VALUES)
  const storedFeatures = sanitizeBooleans(raw.preferredFeatures)
  const derived = derivePreferredFeatures({ primaryGoal, difficulties, priorities, organizationLevel })
  return {
    primaryGoal,
    incomePattern,
    difficulties,
    priorities,
    organizationLevel,
    preferredFeatures: { ...derived, ...storedFeatures },
  }
}

export function getDashboardPriority(profile: FinancialProfile | undefined): DashboardCardKey[] {
  if (!profile) return DEFAULT_DASHBOARD
  const { primaryGoal, organizationLevel, preferredFeatures } = profile
  if (primaryGoal === 'tracking' || organizationLevel === 'tracking') return LEAN_DASHBOARD
  const cards: DashboardCardKey[] = []
  if (preferredFeatures.dailySpend) cards.push('daily-spend')
  if (preferredFeatures.freeMoney) cards.push('free-money')
  // dívidas priorizam orçamento sobre o gráfico de histórico
  const budgetFirst = preferredFeatures.budgets && primaryGoal === 'debt'
  if (budgetFirst) cards.push('budget')
  cards.push('chart')
  if (!budgetFirst) cards.push('budget')
  cards.push('recent')
  return [...new Set(cards)]
}

// Usuário legado tem uso real do app; usuário no meio do onboarding tem no máximo 1 conta e nenhum lançamento.
export function hasSubstantialUserData(data: Partial<FinanceData>): boolean {
  return (data.transactions?.length ?? 0) > 0 ||
    (data.recurringExpenses?.length ?? 0) > 0 ||
    (data.recurringIncomes?.length ?? 0) > 0 ||
    (data.goals?.length ?? 0) > 0 ||
    (data.budgets?.length ?? 0) > 0 ||
    (data.accounts?.length ?? 0) > 1
}

export function buildFinancialProfile(input: {
  primaryGoal: PrimaryGoal
  incomePattern: IncomePattern
  difficulties: string[]
  priorities: string[]
  organizationLevel: OrganizationLevel
}): FinancialProfile {
  return {
    ...input,
    preferredFeatures: derivePreferredFeatures(input),
  }
}

export function normalizeCompletionInput(input: OnboardingCompletionInput | undefined): Required<Pick<OnboardingCompletionInput, 'profileName'>> & { financialProfile?: FinancialProfile } {
  return {
    profileName: input?.profileName?.trim().slice(0, 40) ?? '',
    financialProfile: input?.financialProfile ? sanitizeFinancialProfile(input.financialProfile) : undefined,
  }
}
