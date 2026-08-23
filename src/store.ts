import { create } from 'zustand'
import { indexedDbRepository } from './data/repository'
import type { Account, AiActionLog, AiConversation, AiMessage, AiRule, AllocationPlan, Budget, FinanceData, FinanceTransaction, Goal, RecurringIncome } from './domain'
import { seededData, uid } from './domain'
import type { RecurringExpense } from './domain'
import { isOccurrenceRecorded } from './recurring'

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
}

const persist = (state: FinanceData) => { void indexedDbRepository.save(state) }
const data = (s: State): FinanceData => ({
  accounts: s.accounts,
  transactions: s.transactions,
  budgets: s.budgets,
  recurringExpenses: s.recurringExpenses,
  recurringIncomes: s.recurringIncomes ?? [],
  goals: s.goals ?? [],
  allocationPlans: s.allocationPlans ?? [],
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
})

export const useFinanceStore = create<State>((set, get) => ({
  ...seededData(), ready: false,
  hydrate: async () => {
    const loaded = await indexedDbRepository.load() as Partial<FinanceData> & FinanceData
    const migrated: FinanceData = {
      ...seededData(),
      ...loaded,
      accounts: (loaded.accounts ?? seededData().accounts).map(account => ({ ...account, color: account.color.toLowerCase() === '#27c47d' ? '#2F80ED' : account.color })),
      transactions: loaded.transactions ?? [],
      budgets: loaded.budgets ?? [],
      recurringExpenses: loaded.recurringExpenses ?? [],
      recurringIncomes: (loaded as any).recurringIncomes ?? [],
      goals: (loaded as any).goals ?? [],
      allocationPlans: (loaded as any).allocationPlans ?? [],
      customCategories: (loaded as any).customCategories ?? [],
      customCategoryIcons: (loaded as any).customCategoryIcons ?? {},
      aiConversations: (loaded as any).aiConversations ?? [],
      aiMessages: (loaded as any).aiMessages ?? [],
      aiLogs: (loaded as any).aiLogs ?? [],
      aiRules: (loaded as any).aiRules ?? [],
      readNotificationIds: loaded.readNotificationIds ?? [],
      forecastRealistic: (loaded as Partial<FinanceData>).forecastRealistic ?? true,
      safetyMarginPercent: (loaded as any).safetyMarginPercent ?? 10,
    }
    const needsPersist =
      !loaded.recurringExpenses ||
      !loaded.readNotificationIds ||
      (loaded as Partial<FinanceData>).forecastRealistic === undefined ||
      (loaded as any).safetyMarginPercent === undefined ||
      (loaded as any).customCategoryIcons === undefined ||
      (loaded as any).recurringIncomes === undefined ||
      (loaded as any).goals === undefined ||
      (loaded as any).allocationPlans === undefined ||
      (loaded as any).customCategories === undefined ||
      (loaded as any).aiConversations === undefined ||
      migrated.accounts.some((account, index) => account.color !== (loaded.accounts ?? [])[index]?.color)
    if (needsPersist) persist(migrated)
    set({ ...migrated, ready: true })
  },
  addAccount: account => set(s => { const next = { ...s, accounts: [...s.accounts, account] }; persist(data(next)); return next }),
  updateAccount: account => set(s => { const next = { ...s, accounts: s.accounts.map(a => a.id === account.id ? account : a) }; persist(data(next)); return next }),
  addTransaction: transaction => set(s => { const next = { ...s, transactions: [transaction, ...s.transactions] }; persist(data(next)); return next }),
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
    set(s => { const next = { ...s, transactions: [transaction, ...s.transactions] }; persist(data(next)); return next })
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
}))
