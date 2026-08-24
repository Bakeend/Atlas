import { create } from 'zustand'
import { indexedDbRepository } from './data/repository'
import type { Account, AiActionLog, AiConversation, AiMessage, AiRule, AllocationPlan, Budget, FinanceData, FinanceTransaction, FinancialProfile, Goal, OnboardingCompletionInput, PaymentAllocationPlan, RecurringIncome } from './domain'
import { emptyData, uid } from './domain'
import type { RecurringExpense } from './domain'
import { isOccurrenceRecorded } from './recurring'
import { sanitizeShortcuts } from './navigation'
import { hasSubstantialUserData, normalizeCompletionInput, sanitizeFinancialProfile } from './onboarding/onboardingProfile'

export interface RecurringPaymentInput {
  recurringExpenseId: string
  occurrenceDate: string
  paymentDate: string
  actualAmountInCents: number
  accountId: string
}

type State = FinanceData & {
  ready: boolean
  hydrate: () => Promise<void>
  addAccount: (account: Account) => void
  updateAccount: (account: Account) => void
  removeAccount: (id: string) => boolean
  addTransaction: (transaction: FinanceTransaction) => void
  updateTransaction: (transaction: FinanceTransaction) => void
  softDeleteTransaction: (id: string) => void
  restoreTransaction: (id: string) => boolean
  saveBudget: (budget: Budget) => void
  deleteBudget: (id: string) => void
  saveRecurringExpense: (expense: RecurringExpense) => void
  deleteRecurringExpense: (id: string) => void
  toggleRecurringExpense: (id: string) => void
  saveRecurringIncome: (income: RecurringIncome) => void
  deleteRecurringIncome: (id: string) => void
  saveGoal: (goal: Goal) => void
  deleteGoal: (id: string) => void
  saveAllocationPlan: (plan: AllocationPlan) => void
  deleteAllocationPlan: (id: string) => void
  savePaymentAllocationPlan: (plan: PaymentAllocationPlan) => void
  deletePaymentAllocationPlan: (id: string) => void
  applyPaymentAllocationPlan: (id: string) => void
  cancelPaymentAllocationPlan: (id: string) => void
  updatePaymentAllocationItem: (planId: string, itemId: string, amountInCents: number) => void
  removePaymentAllocationItem: (planId: string, itemId: string) => void
  reorderPaymentAllocationItems: (planId: string, orderedItemIds: string[]) => void
  updatePaymentAllocationItemMeta: (planId: string, itemId: string, patch: { label?: string; goalId?: string; categoryId?: string }) => void
  addCustomCategory: (name: string, icon?: string) => void
  setCustomCategoryIcon: (name: string, icon: string) => void
  renameCategory: (oldName: string, newName: string) => void
  deleteCustomCategory: (name: string) => void
  addAiConversation: (conv: AiConversation) => void
  updateAiConversation: (conv: AiConversation) => void
  deleteAiConversation: (id: string) => void
  addAiMessage: (msg: AiMessage) => void
  addAiLog: (log: AiActionLog) => void
  addAiRule: (rule: AiRule) => void
  markRecurringPaid: (input: RecurringPaymentInput) => boolean
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (ids: string[]) => void
  importTransactions: (transactions: FinanceTransaction[]) => number
  toggleBalances: () => void
  setForecastRealistic: (value: boolean) => void
  setSafetyMarginPercent: (value: number) => void
  setPaymentAllocationPriority: (order: import('./domain').AllocationPriority[]) => void
  addPaymentAllocationPreference: (rule: string) => void
  removePaymentAllocationPreference: (id: string) => void
  setNavShortcuts: (routes: string[]) => void
  setProfileName: (name: string) => void
  completeOnboarding: (input?: OnboardingCompletionInput) => void
  restoreBackup: (backup: import('./domain').FinanceData) => void
  deleteAllData: () => void
}

let lastPersist: Promise<void> = Promise.resolve()
const persist = (state: FinanceData) => {
  lastPersist = Promise.resolve(indexedDbRepository.save(state))
  lastPersist.catch(error => console.error('[STORE] Falha ao persistir dados:', error))
}
export function waitForPersist(): Promise<void> {
  return lastPersist
}

// Snapshot completo dos dados atuais (para exportação de backup)
export function currentSnapshot(): FinanceData {
  return data(useFinanceStore.getState())
}

// Migração única de dados carregados (IndexedDB ou backup importado) — nunca confiar em JSON externo
function migrateLoaded(loaded: Partial<FinanceData>): FinanceData {
  return {
    ...emptyData(),
    ...(loaded as FinanceData),
    accounts: (loaded.accounts ?? []).map(account => ({ ...account, color: account.color?.toLowerCase() === '#27c47d' ? '#2F80ED' : account.color })),
    transactions: loaded.transactions ?? [],
    budgets: loaded.budgets ?? [],
    recurringExpenses: loaded.recurringExpenses ?? [],
    recurringIncomes: (loaded as any).recurringIncomes ?? [],
    goals: (loaded as any).goals ?? [],
    allocationPlans: (loaded as any).allocationPlans ?? [],
    paymentAllocationPlans: (loaded as any).paymentAllocationPlans ?? [],
    customCategories: (loaded as any).customCategories ?? [],
    customCategoryIcons: (loaded as any).customCategoryIcons ?? {},
    aiConversations: (loaded as any).aiConversations ?? [],
    aiMessages: (loaded as any).aiMessages ?? [],
    aiLogs: (loaded as any).aiLogs ?? [],
    aiRules: (loaded as any).aiRules ?? [],
    readNotificationIds: loaded.readNotificationIds ?? [],
    forecastRealistic: (loaded as Partial<FinanceData>).forecastRealistic ?? true,
    safetyMarginPercent: (loaded as any).safetyMarginPercent ?? 10,
    paymentAllocationPriority: (loaded as any).paymentAllocationPriority ?? ['overdue','essential','bills','food','transport','goals','reserve','leisure','free'],
    paymentAllocationPreferences: (loaded as any).paymentAllocationPreferences ?? [],
    navShortcuts: sanitizeShortcuts((loaded as any).navShortcuts),
    profileName: typeof (loaded as any).profileName === 'string' ? (loaded as any).profileName : '',
    // Migração segura: quem já usava o app com dados reais não refaz onboarding; usuário no meio do fluxo (≤1 conta, sem lançamentos) retoma de onde parou.
    onboardingDone: Boolean((loaded as any).onboardingDone) || hasSubstantialUserData(loaded),
    financialProfile: sanitizeFinancialProfile((loaded as any).financialProfile),
  }
}
const data = (s: State): FinanceData => ({
  accounts: s.accounts,
  transactions: s.transactions,
  budgets: s.budgets,
  recurringExpenses: s.recurringExpenses,
  recurringIncomes: s.recurringIncomes ?? [],
  goals: s.goals ?? [],
  allocationPlans: s.allocationPlans ?? [],
  paymentAllocationPlans: (s as any).paymentAllocationPlans ?? [],
  customCategories: s.customCategories ?? [],
  customCategoryIcons: (s as any).customCategoryIcons ?? {},
  aiConversations: s.aiConversations ?? [],
  aiMessages: s.aiMessages ?? [],
  aiLogs: s.aiLogs ?? [],
  aiRules: s.aiRules ?? [],
  hideBalances: s.hideBalances,
  readNotificationIds: s.readNotificationIds,
  forecastRealistic: s.forecastRealistic,
  safetyMarginPercent: s.safetyMarginPercent ?? 10,
  paymentAllocationPriority: (s as any).paymentAllocationPriority ?? ['overdue','essential','bills','food','transport','goals','reserve','leisure','free'],
  paymentAllocationPreferences: (s as any).paymentAllocationPreferences ?? [],
  navShortcuts: s.navShortcuts ?? [],
  profileName: s.profileName ?? '',
  onboardingDone: (s as any).onboardingDone ?? false,
  financialProfile: (s as any).financialProfile,
})

export const useFinanceStore = create<State>((set, get) => ({
  ...emptyData(), ready: false,
  hydrate: async () => {
    const loaded = await indexedDbRepository.load() as Partial<FinanceData>
    const migrated = migrateLoaded(loaded)
    const legacyOnboardingMigration = !(loaded as any).onboardingDone && hasSubstantialUserData(loaded)
    const sanitizedProfile = (migrated as any).financialProfile
    const rawProfile = (loaded as any).financialProfile
    const financialProfileChanged = JSON.stringify(rawProfile ?? null) !== JSON.stringify(sanitizedProfile ?? null)
    const needsPersist =
      !loaded.recurringExpenses ||
      !loaded.readNotificationIds ||
      (loaded as Partial<FinanceData>).forecastRealistic === undefined ||
      (loaded as any).safetyMarginPercent === undefined ||
      (loaded as any).customCategoryIcons === undefined ||
      (loaded as any).paymentAllocationPlans === undefined ||
      (loaded as any).recurringIncomes === undefined ||
      (loaded as any).goals === undefined ||
      (loaded as any).allocationPlans === undefined ||
      (loaded as any).customCategories === undefined ||
      (loaded as any).aiConversations === undefined ||
      (loaded as any).paymentAllocationPriority === undefined ||
      (loaded as any).paymentAllocationPreferences === undefined ||
      (loaded as any).navShortcuts === undefined ||
      legacyOnboardingMigration ||
      financialProfileChanged ||
      migrated.accounts.some((account, index) => account.color !== (loaded.accounts ?? [])[index]?.color)
    if (needsPersist) persist(migrated)
    set({ ...migrated, ready: true })
  },
  addAccount: account => set(s => { const next = { ...s, accounts: [...s.accounts, account] }; persist(data(next)); return next }),
  updateAccount: account => set(s => { const next = { ...s, accounts: s.accounts.map(a => a.id === account.id ? account : a) }; persist(data(next)); return next }),
  removeAccount: id => {
    if (!get().accounts.some(a => a.id === id)) return false
    set(s => { const next = { ...s, accounts: s.accounts.filter(a => a.id !== id) }; persist(data(next)); return next })
    return true
  },
  addTransaction: transaction => set(s => {
    let nextPlans = (s as any).paymentAllocationPlans ?? []
    // consome reserva virtual se pagar conta reservada — por recurringExpenseId ou por label/categoria aproximado
    if (transaction.type === 'expense') {
      const matchFn = (it: any) => !it.isConsumed && (
        (transaction.recurringExpenseId && it.recurringExpenseId === transaction.recurringExpenseId) ||
        (!transaction.recurringExpenseId && it.type === 'bill' && it.label.toLowerCase() === transaction.description.toLowerCase() && Math.abs(it.amountInCents - transaction.amountCents) < 500)
      )
      const needsUpdate = nextPlans.some((plan: any) => plan.status === 'applied' && plan.items.some(matchFn))
      if (needsUpdate) {
        nextPlans = nextPlans.map((plan: any) => {
          if (plan.status !== 'applied') return plan
          if (!plan.items.some(matchFn)) return plan
          const items = plan.items.map((it: any) => matchFn(it) ? { ...it, isConsumed: true } : it)
          return { ...plan, items, updatedAt: new Date().toISOString() }
        })
      }
    }
    const next = { ...s, transactions: [transaction, ...s.transactions], paymentAllocationPlans: nextPlans }
    persist(data(next as any)); return next as any
  }),
  updateTransaction: transaction => set(s => { const next = { ...s, transactions: s.transactions.map(t => t.id === transaction.id ? transaction : t) }; persist(data(next)); return next }),
  softDeleteTransaction: id => set(s => { const next = { ...s, transactions: s.transactions.map(t => t.id === id ? { ...t, deletedAt: new Date().toISOString() } : t) }; persist(data(next)); return next }),
  restoreTransaction: id => {
    const cur = get()
    const t = cur.transactions.find(x => x.id===id)
    if (!t?.deletedAt) return false
    set(s => { const next = { ...s, transactions: s.transactions.map(x => x.id===id ? { ...x, deletedAt: undefined } : x) }; persist(data(next)); return next })
    return true
  },
  saveBudget: budget => set(s => { const found = s.budgets.some(b => b.id === budget.id); const next = { ...s, budgets: found ? s.budgets.map(b => b.id === budget.id ? budget : b) : [...s.budgets, budget] }; persist(data(next)); return next }),
  deleteBudget: id => set(s => { const next = { ...s, budgets: s.budgets.filter(b => b.id!==id) }; persist(data(next)); return next }),
  saveRecurringExpense: expense => set(s => {
    const exists = s.recurringExpenses.some(item => item.id === expense.id)
    const next = { ...s, recurringExpenses: exists ? s.recurringExpenses.map(item => item.id === expense.id ? expense : item) : [...s.recurringExpenses, expense] }
    persist(data(next)); return next
  }),
  deleteRecurringExpense: id => set(s => { const next = { ...s, recurringExpenses: s.recurringExpenses.filter(item => item.id !== id) }; persist(data(next)); return next }),
  toggleRecurringExpense: id => set(s => { const next = { ...s, recurringExpenses: s.recurringExpenses.map(item => item.id === id ? { ...item, isActive: !item.isActive, updatedAt: new Date().toISOString() } : item) }; persist(data(next)); return next }),
  saveRecurringIncome: income => set(s => {
    const exists = (s.recurringIncomes ?? []).some(i => i.id === income.id)
    const next = { ...s, recurringIncomes: exists ? (s.recurringIncomes ?? []).map(i => i.id===income.id? income : i) : [...(s.recurringIncomes ?? []), income] }
    persist(data(next)); return next
  }),
  deleteRecurringIncome: id => set(s => { const next = { ...s, recurringIncomes: (s.recurringIncomes ?? []).filter(i => i.id!==id) }; persist(data(next)); return next }),
  saveGoal: goal => set(s => {
    const exists = (s.goals ?? []).some(g => g.id===goal.id)
    const next = { ...s, goals: exists ? (s.goals ?? []).map(g => g.id===goal.id? goal : g) : [...(s.goals ?? []), goal] }
    persist(data(next)); return next
  }),
  deleteGoal: id => set(s => { const next = { ...s, goals: (s.goals ?? []).filter(g => g.id!==id) }; persist(data(next)); return next }),
  saveAllocationPlan: plan => set(s => {
    const exists = (s.allocationPlans ?? []).some(p => p.id===plan.id)
    const next = { ...s, allocationPlans: exists ? (s.allocationPlans ?? []).map(p => p.id===plan.id? plan : p) : [...(s.allocationPlans ?? []), plan] }
    persist(data(next)); return next
  }),
  deleteAllocationPlan: id => set(s => { const next = { ...s, allocationPlans: (s.allocationPlans ?? []).filter(p => p.id!==id) }; persist(data(next)); return next }),
  savePaymentAllocationPlan: plan => set(s => {
    const list = (s as any).paymentAllocationPlans ?? []
    const exists = list.some((p: any) => p.id === plan.id)
    const nextList = exists ? list.map((p: any) => p.id === plan.id ? plan : p) : [...list, plan]
    const next = { ...s, paymentAllocationPlans: nextList }
    persist(data(next as any)); return next as any
  }),
  deletePaymentAllocationPlan: id => set(s => {
    const next = { ...s, paymentAllocationPlans: ((s as any).paymentAllocationPlans ?? []).filter((p: any) => p.id !== id) }
    persist(data(next as any)); return next as any
  }),
  applyPaymentAllocationPlan: id => set(s => {
    const list = (s as any).paymentAllocationPlans ?? []
    const nextList = list.map((p: any) => p.id === id ? { ...p, status: 'applied' as const, updatedAt: new Date().toISOString() } : p)
    const next = { ...s, paymentAllocationPlans: nextList }
    persist(data(next as any)); return next as any
  }),
  cancelPaymentAllocationPlan: id => set(s => {
    const list = (s as any).paymentAllocationPlans ?? []
    const nextList = list.map((p: any) => p.id === id ? { ...p, status: 'cancelled' as const, updatedAt: new Date().toISOString() } : p)
    const next = { ...s, paymentAllocationPlans: nextList }
    persist(data(next as any)); return next as any
  }),
  updatePaymentAllocationItem: (planId, itemId, amountInCents) => set(s => {
    const list = (s as any).paymentAllocationPlans ?? []
    const nextList = list.map((p: any) => {
      if (p.id !== planId) return p
      if (p.status !== 'draft') return p
      const items = p.items.map((it: any) => it.id === itemId ? { ...it, amountInCents } : it)
      const total = items.reduce((sum: number, it: any) => sum + (it.type !== 'free' ? it.amountInCents : 0), 0)
      const free = items.find((it: any) => it.type === 'free')
      const freeAmount = p.receivedAmountInCents - total
      const nextItems = free ? items.map((it: any) => it.type === 'free' ? { ...it, amountInCents: Math.max(0, freeAmount) } : it) : items
      return { ...p, items: nextItems, freeAmountInCents: freeAmount, updatedAt: new Date().toISOString() }
    })
    const next = { ...s, paymentAllocationPlans: nextList }
    persist(data(next as any)); return next as any
  }),
  removePaymentAllocationItem: (planId, itemId) => set(s => {
    const list = (s as any).paymentAllocationPlans ?? []
    const nextList = list.map((p: any) => {
      if (p.id !== planId) return p
      if (p.status !== 'draft') return p
      const items = p.items.filter((it: any) => it.id !== itemId)
      // garante que livre existe
      const hasFree = items.some((it: any) => it.type === 'free')
      const total = items.reduce((sum: number, it: any) => sum + (it.type !== 'free' ? it.amountInCents : 0), 0)
      const freeAmount = p.receivedAmountInCents - total
      let nextItems = items
      if (hasFree) {
        nextItems = items.map((it: any) => it.type === 'free' ? { ...it, amountInCents: Math.max(0, freeAmount) } : it)
      } else {
        // recria livre se foi removido
        nextItems = [...items, { id: uid(), label: 'Livre', type: 'free', amountInCents: Math.max(0, freeAmount) }]
      }
      return { ...p, items: nextItems, freeAmountInCents: freeAmount, updatedAt: new Date().toISOString() }
    })
    const next = { ...s, paymentAllocationPlans: nextList }
    persist(data(next as any)); return next as any
  }),
  reorderPaymentAllocationItems: (planId, orderedItemIds) => set(s => {
    const list = (s as any).paymentAllocationPlans ?? []
    const nextList = list.map((p: any) => {
      if (p.id !== planId) return p
      if (p.status !== 'draft') return p
      const map = new Map(p.items.map((it: any) => [it.id, it]))
      const ordered = orderedItemIds.map(id => map.get(id)).filter(Boolean)
      // mantém itens não listados no final (ex: free)
      const remaining = p.items.filter((it: any) => !orderedItemIds.includes(it.id))
      return { ...p, items: [...ordered, ...remaining], updatedAt: new Date().toISOString() }
    })
    const next = { ...s, paymentAllocationPlans: nextList }
    persist(data(next as any)); return next as any
  }),
  updatePaymentAllocationItemMeta: (planId, itemId, patch) => set(s => {
    const list = (s as any).paymentAllocationPlans ?? []
    const nextList = list.map((p: any) => {
      if (p.id !== planId) return p
      if (p.status !== 'draft') return p
      const items = p.items.map((it: any) => it.id === itemId ? { ...it, ...patch } : it)
      return { ...p, items, updatedAt: new Date().toISOString() }
    })
    const next = { ...s, paymentAllocationPlans: nextList }
    persist(data(next as any)); return next as any
  }),
  addCustomCategory: (name, icon) => set(s => {
    const n = name.trim()
    if (!n || (s.customCategories ?? []).some(c=> c.toLowerCase()===n.toLowerCase())) return s
    const icons = { ...((s as any).customCategoryIcons ?? {}) }
    if (icon) icons[n] = icon
    const next = { ...s, customCategories: [...(s.customCategories ?? []), n], customCategoryIcons: icons }
    persist(data(next as any)); return next as any
  }),
  setCustomCategoryIcon: (name, icon) => set(s => {
    const icons = { ...((s as any).customCategoryIcons ?? {}), [name]: icon }
    const next = { ...s, customCategoryIcons: icons }
    persist(data(next as any)); return next as any
  }),
  renameCategory: (oldName, newName) => set(s => {
    const n = newName.trim()
    if (!n) return s
    const nextTx = s.transactions.map(t => t.category===oldName ? { ...t, category: n } : t)
    const nextBudgets = s.budgets.map(b => b.category===oldName ? { ...b, category: n } : b)
    const nextRec = s.recurringExpenses.map(r => r.category===oldName ? { ...r, category: n, updatedAt: new Date().toISOString() } : r)
    const nextInc = (s.recurringIncomes ?? []).map((r:any) => r.category===oldName ? { ...r, category: n, updatedAt: new Date().toISOString() } : r)
    const nextCats = (s.customCategories ?? []).map(c => c===oldName? n : c)
    const icons = { ...((s as any).customCategoryIcons ?? {}) }
    if (icons[oldName]) { icons[n] = icons[oldName]; delete icons[oldName] }
    const next = { ...s, transactions: nextTx, budgets: nextBudgets, recurringExpenses: nextRec, recurringIncomes: nextInc, customCategories: nextCats, customCategoryIcons: icons }
    persist(data(next as any)); return next as any
  }),
  deleteCustomCategory: name => set(s => {
    const icons = { ...((s as any).customCategoryIcons ?? {}) }
    delete icons[name]
    const next = { ...s, customCategories: (s.customCategories ?? []).filter(c=> c!==name), customCategoryIcons: icons }
    persist(data(next as any)); return next as any
  }),
  addAiConversation: conv => set(s => { const next = { ...s, aiConversations: [...(s.aiConversations ?? []), conv] }; persist(data(next)); return next }),
  updateAiConversation: conv => set(s => { const next = { ...s, aiConversations: (s.aiConversations ?? []).map(c=> c.id===conv.id? conv : c) }; persist(data(next)); return next }),
  deleteAiConversation: id => set(s => {
    const next = { ...s, aiConversations: (s.aiConversations ?? []).filter(c=> c.id!==id), aiMessages: (s.aiMessages ?? []).filter(m=> m.conversationId!==id) }
    persist(data(next)); return next
  }),
  addAiMessage: msg => set(s => {
    const next = { ...s, aiMessages: [...(s.aiMessages ?? []), msg] }
    // also update conversation updatedAt
    const convs = (next.aiConversations ?? []).map(c=> c.id===msg.conversationId ? { ...c, updatedAt: new Date().toISOString(), title: c.title==='Nova conversa' && msg.role==='user' ? msg.content.slice(0,40) : c.title } : c)
    const final = { ...next, aiConversations: convs }
    persist(data(final)); return final
  }),
  addAiLog: log => set(s => { const next = { ...s, aiLogs: [...(s.aiLogs ?? []), log] }; persist(data(next)); return next }),
  addAiRule: rule => set(s => { const next = { ...s, aiRules: [...(s.aiRules ?? []), rule] }; persist(data(next)); return next }),
  markRecurringPaid: input => {
    const current = get()
    const expense = current.recurringExpenses.find(item => item.id === input.recurringExpenseId)
    if (!expense || isOccurrenceRecorded(current.transactions, input.recurringExpenseId, input.occurrenceDate)) return false
    const transaction: FinanceTransaction = {
      id: uid(), type: 'expense', amountCents: input.actualAmountInCents,
      description: expense.name, category: expense.category, accountId: input.accountId,
      date: input.paymentDate, note: expense.description,
      recurringExpenseId: expense.id, recurringOccurrenceDate: input.occurrenceDate,
      plannedAmountCents: expense.amountInCents, createdAt: new Date().toISOString(),
    }
    set(s => {
      // consome reserva virtual correspondente
      let nextPlans = (s as any).paymentAllocationPlans ?? []
      nextPlans = nextPlans.map((plan: any) => {
        if (plan.status !== 'applied') return plan
        const hasItem = plan.items.some((it: any) => it.recurringExpenseId === expense.id && !it.isConsumed)
        if (!hasItem) return plan
        const items = plan.items.map((it: any) => it.recurringExpenseId === expense.id && !it.isConsumed ? { ...it, isConsumed: true } : it)
        return { ...plan, items, updatedAt: new Date().toISOString() }
      })
      const next = { ...s, transactions: [transaction, ...s.transactions], paymentAllocationPlans: nextPlans }
      persist(data(next as any)); return next as any
    })
    return true
  },
  markNotificationRead: id => set(s => {
    if (s.readNotificationIds.includes(id)) return s
    const next = { ...s, readNotificationIds: [...s.readNotificationIds, id] }
    persist(data(next)); return next
  }),
  markAllNotificationsRead: ids => set(s => {
    const nextIds = [...new Set([...s.readNotificationIds, ...ids])]
    if (nextIds.length === s.readNotificationIds.length) return s
    const next = { ...s, readNotificationIds: nextIds }
    persist(data(next)); return next
  }),
  importTransactions: transactions => {
    if (!transactions.length) return 0
    let count = 0
    set(s => {
      const next = { ...s, transactions: [...transactions, ...s.transactions] }
      persist(data(next))
      count = transactions.length
      return next
    })
    return count
  },
  toggleBalances: () => set(s => { const next = { ...s, hideBalances: !s.hideBalances }; persist(data(next)); return next }),
  setForecastRealistic: value => set(s => { if (s.forecastRealistic === value) return s; const next = { ...s, forecastRealistic: value }; persist(data(next)); return next }),
  setSafetyMarginPercent: value => set(s => {
    const v = Math.max(0, Math.min(50, Math.round(value)))
    if (s.safetyMarginPercent === v) return s
    const next = { ...s, safetyMarginPercent: v }
    persist(data(next)); return next
  }),
  setPaymentAllocationPriority: order => set(s => {
    const next = { ...s, paymentAllocationPriority: order }
    persist(data(next as any)); return next as any
  }),
  addPaymentAllocationPreference: rule => set(s => {
    const pref = { id: uid(), rule: rule.trim(), createdAt: new Date().toISOString() }
    if (!pref.rule) return s
    // nunca inferir regra permanente sem autorização — só adiciona se usuário explicitamente pediu
    const next = { ...s, paymentAllocationPreferences: [...((s as any).paymentAllocationPreferences ?? []), pref] }
    persist(data(next as any)); return next as any
  }),
  removePaymentAllocationPreference: id => set(s => {
    const next = { ...s, paymentAllocationPreferences: ((s as any).paymentAllocationPreferences ?? []).filter((p:any)=> p.id!==id) }
    persist(data(next as any)); return next as any
  }),
  setNavShortcuts: routes => set(s => {
    const nextRoutes = sanitizeShortcuts(routes)
    if (JSON.stringify(nextRoutes) === JSON.stringify(s.navShortcuts)) return s
    const next = { ...s, navShortcuts: nextRoutes }
    persist(data(next)); return next
  }),
  setProfileName: name => set(s => {
    const clean = name.trim().slice(0, 40)
    if (s.profileName === clean) return s
    const next = { ...s, profileName: clean }
    persist(data(next as any)); return next as any
  }),
  // Única action de conclusão: grava nome + perfil + flag numa única persistência.
  // Re-executável de propósito — "Refazer configuração" e edição de preferências passam por aqui sem tocar nos dados financeiros.
  completeOnboarding: input => set(s => {
    const normalized = normalizeCompletionInput(input)
    const next = { ...s, profileName: normalized.profileName || (s.profileName ?? ''), financialProfile: normalized.financialProfile ?? (s as any).financialProfile, onboardingDone: true }
    persist(data(next as any)); return next as any
  }),
  restoreBackup: backup => {
    const migrated = migrateLoaded(backup)
    persist(migrated)
    set({ ...migrated, ready: true })
  },
  deleteAllData: () => {
    const fresh = emptyData()
    // set é merge raso: campo opcional precisa ser anulado explicitamente para não vazar entre resets
    persist(fresh)
    set({ ...fresh, ready: true, financialProfile: undefined })
  },
}))
