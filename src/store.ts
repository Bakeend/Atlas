import { create } from 'zustand'
import { indexedDbRepository } from './data/repository'
import type { Account, Budget, FinanceData, FinanceTransaction } from './domain'
import { seededData } from './domain'

type State = FinanceData & {
  ready: boolean
  hydrate: () => Promise<void>
  addAccount: (account: Account) => void
  updateAccount: (account: Account) => void
  addTransaction: (transaction: FinanceTransaction) => void
  updateTransaction: (transaction: FinanceTransaction) => void
  softDeleteTransaction: (id: string) => void
  saveBudget: (budget: Budget) => void
  toggleBalances: () => void
}

const persist = (state: FinanceData) => { void indexedDbRepository.save(state) }
const data = (s: State): FinanceData => ({ accounts: s.accounts, transactions: s.transactions, budgets: s.budgets, hideBalances: s.hideBalances })

export const useFinanceStore = create<State>((set, get) => ({
  ...seededData(), ready: false,
  hydrate: async () => set({ ...(await indexedDbRepository.load()), ready: true }),
  addAccount: account => set(s => { const next = { ...s, accounts: [...s.accounts, account] }; persist(data(next)); return next }),
  updateAccount: account => set(s => { const next = { ...s, accounts: s.accounts.map(a => a.id === account.id ? account : a) }; persist(data(next)); return next }),
  addTransaction: transaction => set(s => { const next = { ...s, transactions: [transaction, ...s.transactions] }; persist(data(next)); return next }),
  updateTransaction: transaction => set(s => { const next = { ...s, transactions: s.transactions.map(t => t.id === transaction.id ? transaction : t) }; persist(data(next)); return next }),
  softDeleteTransaction: id => set(s => { const next = { ...s, transactions: s.transactions.map(t => t.id === id ? { ...t, deletedAt: new Date().toISOString() } : t) }; persist(data(next)); return next }),
  saveBudget: budget => set(s => { const found = s.budgets.some(b => b.id === budget.id); const next = { ...s, budgets: found ? s.budgets.map(b => b.id === budget.id ? budget : b) : [...s.budgets, budget] }; persist(data(next)); return next }),
  toggleBalances: () => set(s => { const next = { ...s, hideBalances: !s.hideBalances }; persist(data(next)); return next }),
}))
