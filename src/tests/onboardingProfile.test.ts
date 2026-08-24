import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearOnboardingDraft, emptyDraft, loadOnboardingDraft, saveOnboardingDraft } from '../onboarding/draft'
import {
  buildFinancialProfile,
  derivePreferredFeatures,
  getDashboardPriority,
  getEffectiveFinancialProfile,
  hasSubstantialUserData,
  sanitizeFinancialProfile,
} from '../onboarding/onboardingProfile'
import { useFinanceStore, waitForPersist } from '../store'

const baseInput = {
  primaryGoal: 'save' as const,
  incomePattern: 'fixed' as const,
  difficulties: [] as string[],
  priorities: [] as string[],
  organizationLevel: 'guided' as const,
}

describe('derivePreferredFeatures', () => {
  it('safe-spend destaca hoje, dinheiro livre e alertas', () => {
    const features = derivePreferredFeatures({ ...baseInput, primaryGoal: 'safe-spend' })
    expect(features.dailySpend).toBe(true)
    expect(features.freeMoney).toBe(true)
    expect(features.alerts).toBe(true)
    expect(features.goals).toBe(false)
  })

  it('save destaca metas e dinheiro livre', () => {
    const features = derivePreferredFeatures({ ...baseInput, primaryGoal: 'save' })
    expect(features.goals).toBe(true)
    expect(features.freeMoney).toBe(true)
    expect(features.dailySpend).toBe(false)
  })

  it('debt destaca compromissos, orçamento e previsão', () => {
    const features = derivePreferredFeatures({ ...baseInput, primaryGoal: 'debt' })
    expect(features.recurring).toBe(true)
    expect(features.budgets).toBe(true)
    expect(features.forecast).toBe(true)
  })

  it('tracking fica enxuto sem extras', () => {
    const features = derivePreferredFeatures({ ...baseInput, primaryGoal: 'tracking' })
    expect(Object.values(features).every(Boolean)).toBe(false)
  })

  it('nível assisted/automatic ativa aiPlanning sem conceder nada destrutivo', () => {
    expect(derivePreferredFeatures({ ...baseInput, organizationLevel: 'assisted' }).aiPlanning).toBe(true)
    expect(derivePreferredFeatures({ ...baseInput, organizationLevel: 'tracking' }).aiPlanning).toBe(false)
  })

  it('dificuldades e prioridades reforçam features', () => {
    const features = derivePreferredFeatures({
      ...baseInput,
      difficulties: ['daily-overspend'],
      priorities: ['Reserva'],
    })
    expect(features.dailySpend).toBe(true)
    expect(features.goals).toBe(true)
    expect(features.freeMoney).toBe(true)
  })
})

describe('sanitizeFinancialProfile', () => {
  it('aceita perfil válido preservando escolhas', () => {
    const profile = buildFinancialProfile(baseInput)
    const sanitized = sanitizeFinancialProfile(profile)
    expect(sanitized?.primaryGoal).toBe('save')
    expect(sanitized?.preferredFeatures.goals).toBe(true)
  })

  it('retorna undefined para lixo ou objetivo inválido', () => {
    expect(sanitizeFinancialProfile(undefined)).toBeUndefined()
    expect(sanitizeFinancialProfile(null)).toBeUndefined()
    expect(sanitizeFinancialProfile('lixo')).toBeUndefined()
    expect(sanitizeFinancialProfile({ primaryGoal: 'hacker' })).toBeUndefined()
  })

  it('filtra arrays com valores desconhecidos e aplica fallbacks seguros', () => {
    const sanitized = sanitizeFinancialProfile({
      primaryGoal: 'save',
      incomePattern: 'improvavel',
      organizationLevel: 'improvavel',
      difficulties: ['daily-overspend', 'injecao'],
      priorities: ['Reserva', 'Iate'],
      preferredFeatures: { dailySpend: true },
    })
    expect(sanitized?.incomePattern).toBe('unknown')
    expect(sanitized?.organizationLevel).toBe('guided')
    expect(sanitized?.difficulties).toEqual(['daily-overspend'])
    expect(sanitized?.priorities).toEqual(['Reserva'])
    // feature salva explicitamente vence a derivação
    expect(sanitized?.preferredFeatures.dailySpend).toBe(true)
  })

  it('getEffectiveFinancialProfile devolve undefined sem perfil (dashboard padrão)', () => {
    expect(getEffectiveFinancialProfile({})).toBeUndefined()
    expect(getEffectiveFinancialProfile({ financialProfile: undefined })).toBeUndefined()
    expect(getEffectiveFinancialProfile({ financialProfile: sanitizeFinancialProfile({ primaryGoal: 'save' }) })?.primaryGoal).toBe('save')
  })
})

describe('getDashboardPriority', () => {
  it('sem perfil retorna o layout padrão atual', () => {
    expect(getDashboardPriority(undefined)).toEqual(['chart', 'budget', 'recent'])
  })

  it('safe-spend traz hoje e dinheiro livre primeiro', () => {
    const priority = getDashboardPriority(buildFinancialProfile({ ...baseInput, primaryGoal: 'safe-spend' }))
    expect(priority.slice(0, 2)).toEqual(['daily-spend', 'free-money'])
  })

  it('objetivo tracking reduz o dashboard', () => {
    expect(getDashboardPriority(buildFinancialProfile({ ...baseInput, primaryGoal: 'tracking' }))).toEqual(['budget', 'recent'])
  })

  it('nível tracking também reduz o dashboard', () => {
    expect(getDashboardPriority(buildFinancialProfile({ ...baseInput, organizationLevel: 'tracking' }))).toEqual(['budget', 'recent'])
  })

  it('sem cards extra mantém ordem padrão', () => {
    expect(getDashboardPriority(buildFinancialProfile({ ...baseInput, primaryGoal: 'organize' }))).toEqual(['chart', 'budget', 'recent'])
  })

  it('dívidas colocam orçamento antes do gráfico', () => {
    const priority = getDashboardPriority(buildFinancialProfile({ ...baseInput, primaryGoal: 'debt' }))
    expect(priority.indexOf('budget')).toBeLessThan(priority.indexOf('chart'))
  })
})

describe('hasSubstantialUserData', () => {
  it('usuário legado com lançamentos é considerado concluído', () => {
    expect(hasSubstantialUserData({ transactions: [{ id: 't1' } as never] })).toBe(true)
    expect(hasSubstantialUserData({ accounts: [{ id: 'a1' }, { id: 'a2' } ] as never })).toBe(true)
  })

  it('usuário no meio do onboarding (até 1 conta, sem lançamentos) não é marcado', () => {
    expect(hasSubstantialUserData({})).toBe(false)
    expect(hasSubstantialUserData({ accounts: [{ id: 'a1' }] as never })).toBe(false)
  })
})

describe('buildFinancialProfile', () => {
  it('deriva features no momento da conclusão', () => {
    const profile = buildFinancialProfile({ ...baseInput, priorities: ['Dívidas'] })
    expect(profile.preferredFeatures.recurring).toBe(true)
    expect(profile.preferredFeatures.forecast).toBe(true)
  })
})

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, String(value)) }
  removeItem(key: string) { this.map.delete(key) }
}

describe('rascunho do onboarding (localStorage)', () => {
  beforeEach(() => { (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage() })
  afterEach(() => { clearOnboardingDraft(); delete (globalThis as { localStorage?: unknown }).localStorage })

  it('salva e restaura etapa e respostas', () => {
    saveOnboardingDraft({ version: 1, step: 4, profileName: 'Cláudio', difficulties: ['many-bills'], priorities: ['Moradia'], primaryGoal: 'organize', incomePattern: 'fixed', organizationLevel: 'assisted' })
    const restored = loadOnboardingDraft()
    expect(restored.step).toBe(4)
    expect(restored.profileName).toBe('Cláudio')
    expect(restored.priorities).toEqual(['Moradia'])
  })

  it('descarta rascunho de versão desconhecida ou corrompido sem quebrar', () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => '{quebrado',
      setItem: () => {},
      removeItem: () => {},
    }
    expect(loadOnboardingDraft()).toEqual(emptyDraft())
  })

  it('funciona sem localStorage disponível', () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = undefined
    expect(() => saveOnboardingDraft(emptyDraft(2))).not.toThrow()
    expect(loadOnboardingDraft()).toEqual(emptyDraft())
  })
})

describe('store.completeOnboarding', () => {
  beforeEach(() => { useFinanceStore.getState().deleteAllData() })

  it('grava nome, perfil e flag numa única action', async () => {
    const profile = buildFinancialProfile(baseInput)
    useFinanceStore.getState().completeOnboarding({ profileName: '  Claudio  ', financialProfile: profile })
    await expect(waitForPersist()).resolves.toBeUndefined()
    const state = useFinanceStore.getState()
    expect(state.profileName).toBe('Claudio')
    expect(state.onboardingDone).toBe(true)
    expect(state.financialProfile?.primaryGoal).toBe('save')
    expect(state.accounts).toHaveLength(0)
  })

  it('é re-executável para atualizar preferências sem apagar dados', async () => {
    useFinanceStore.getState().addAccount({ id: 'a1', name: 'Nubank', type: 'checking', initialBalanceCents: 1000, color: '#2F80ED', archived: false, createdAt: new Date().toISOString() })
    const updated = buildFinancialProfile({ ...baseInput, primaryGoal: 'debt' })
    useFinanceStore.getState().completeOnboarding({ financialProfile: updated })
    await waitForPersist()
    const state = useFinanceStore.getState()
    expect(state.financialProfile?.primaryGoal).toBe('debt')
    expect(state.profileName).toBe('')
    expect(state.accounts).toHaveLength(1)
  })

  it('skip sem respostas marca concluído e mantém dashboard padrão', async () => {
    useFinanceStore.getState().completeOnboarding({})
    await waitForPersist()
    const state = useFinanceStore.getState()
    expect(state.onboardingDone).toBe(true)
    expect(getDashboardPriority(state.financialProfile)).toEqual(['chart', 'budget', 'recent'])
  })
})
