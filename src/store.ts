import { create } from 'zustand'
import { indexedDbRepository } from './data/repository'
import type { Account, Budget, FinanceData, FinanceTransaction } from './domain'
import { seededData, uid } from './domain'
import type { RecurringExpense } from './recurring'
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
  saveBudget: (budget: Budget) => void
  saveRecurringExpense: (expense: RecurringExpense) => void
  deleteRecurringExpense: (id: string) => void
  toggleRecurringExpense: (id: string) => void
  markRecurringPaid: (input: RecurringPaymentInput) => boolean
  toggleBalances: () => void
}

const persist = (state: FinanceData) => { void indexedDbRepository.save(state) }
const data = (s: State): FinanceData => ({ accounts: s.accounts, transactions: s.transactions, budgets: s.budgets, recurringExpenses: s.recurringExpenses, hideBalances: s.hideBalances })

export const useFinanceStore = create<State>((set, get) => ({
  ...seededData(), ready: false,
  hydrate: async () => {
    const loaded = await indexedDbRepository.load()
    const migrated: FinanceData = { ...loaded, recurringExpenses: loaded.recurringExpenses ?? [], accounts: loaded.accounts.map(account => ({ ...account, color: account.color.toLowerCase() === '#27c47d' ? '#2F80ED' : account.color })) }
    if (!loaded.recurringExpenses || migrated.accounts.some((account, index) => account.color !== loaded.accounts[index].color)) persist(migrated)
    set({ ...migrated, ready: true })
  },
  addAccount: account => set(s => { const next = { ...s, accounts: [...s.accounts, account] }; persist(data(next)); return next }),
  updateAccount: account => set(s => { const next = { ...s, accounts: s.accounts.map(a => a.id === account.id ? account : a) }; persist(data(next)); return next }),
  addTransaction: transaction => set(s => { const next = { ...s, transactions: [transaction, ...s.transactions] }; persist(data(next)); return next }),
  updateTransaction: transaction => set(s => { const next = { ...s, transactions: s.transactions.map(t => t.id === transaction.id ? transaction : t) }; persist(data(next)); return next }),
  softDeleteTransaction: id => set(s => { const next = { ...s, transactions: s.transactions.map(t => t.id === id ? { ...t, deletedAt: new Date().toISOString() } : t) }; persist(data(next)); return next }),
  saveBudget: budget => set(s => { const found = s.budgets.some(b => b.id === budget.id); const next = { ...s, budgets: found ? s.budgets.map(b => b.id === budget.id ? budget : b) : [...s.budgets, budget] }; persist(data(next)); return next }),
  saveRecurringExpense: expense => set(s => {
    const exists = s.recurringExpenses.some(item => item.id === expense.id)
    const next = { ...s, recurringExpenses: exists ? s.recurringExpenses.map(item => item.id === expense.id ? expense : item) : [...s.recurringExpenses, expense] }
    persist(data(next)); return next
  }),
  deleteRecurringExpense: id => set(s => { const next = { ...s, recurringExpenses: s.recurringExpenses.filter(item => item.id !== id) }; persist(data(next)); return next }),
  toggleRecurringExpense: id => set(s => { const next = { ...s, recurringExpenses: s.recurringExpenses.map(item => item.id === id ? { ...item, isActive: !item.isActive, updatedAt: new Date().toISOString() } : item) }; persist(data(next)); return next }),
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
  toggleBalances: () => set(s => { const next = { ...s, hideBalances: !s.hideBalances }; persist(data(next)); return next }),
}))
