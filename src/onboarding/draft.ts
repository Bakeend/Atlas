import type { IncomePattern, OrganizationLevel, PrimaryGoal } from '../domain'
import { INCOME_PATTERNS, ORGANIZATION_LEVELS, PRIMARY_GOALS } from './onboardingProfile'

// Rascunho guarda apenas respostas temporárias do onboarding.
// Conta e receita criadas no fluxo são dados reais e vão direto para o IndexedDB via store.
export interface OnboardingDraft {
  version: 1
  step: number
  profileName: string
  primaryGoal?: PrimaryGoal
  incomePattern?: IncomePattern
  difficulties: string[]
  priorities: string[]
  organizationLevel?: OrganizationLevel
}

const DRAFT_KEY = 'atlas-onboarding-draft'
const DRAFT_VERSION = 1

function storage(): Storage | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined
    return localStorage
  } catch { return undefined }
}

export function emptyDraft(step = 0): OnboardingDraft {
  return { version: DRAFT_VERSION, step, profileName: '', difficulties: [], priorities: [] }
}

export function loadOnboardingDraft(): OnboardingDraft {
  const store = storage()
  if (!store) return emptyDraft()
  try {
    const raw = store.getItem(DRAFT_KEY)
    if (!raw) return emptyDraft()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return emptyDraft()
    const value = parsed as Record<string, unknown>
    if (value.version !== DRAFT_VERSION) return emptyDraft()
    const step = typeof value.step === 'number' && Number.isInteger(value.step) && value.step >= 0 && value.step <= 8 ? value.step : 0
    return {
      version: DRAFT_VERSION,
      step,
      profileName: typeof value.profileName === 'string' ? value.profileName.slice(0, 40) : '',
      primaryGoal: PRIMARY_GOALS.find(goal => goal === value.primaryGoal),
      incomePattern: INCOME_PATTERNS.find(pattern => pattern === value.incomePattern),
      difficulties: Array.isArray(value.difficulties) ? value.difficulties.filter((item): item is string => typeof item === 'string') : [],
      priorities: Array.isArray(value.priorities) ? value.priorities.filter((item): item is string => typeof item === 'string') : [],
      organizationLevel: ORGANIZATION_LEVELS.find(level => level === value.organizationLevel),
    }
  } catch {
    // rascunho corrompido não deve bloquear o onboarding — começa do zero
    return emptyDraft()
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
  const store = storage()
  if (!store) return
  try { store.setItem(DRAFT_KEY, JSON.stringify({ ...draft, version: DRAFT_VERSION })) } catch {}
}

export function clearOnboardingDraft(): void {
  const store = storage()
  if (!store) return
  try { store.removeItem(DRAFT_KEY) } catch {}
}
