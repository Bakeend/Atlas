import type { FinanceData } from '../domain'
import { emptyData } from '../domain'
import type { RecurringExpense } from '../recurring'

const DB_NAME = 'atlas-finance'; const STORE = 'state'; const KEY = 'finance-data'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export interface FinanceRepository { load(): Promise<FinanceData>; save(data: FinanceData): Promise<void> }
export interface RecurringExpenseRepository { load(): Promise<RecurringExpense[]>; save(expenses: RecurringExpense[]): Promise<void> }

export const indexedDbRepository: FinanceRepository = {
  async load() {
    try {
      const db = await openDb()
      return await new Promise<FinanceData>((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
        request.onsuccess = () => resolve(request.result ?? emptyData())
        request.onerror = () => reject(request.error)
      })
    } catch { return emptyData() }
  },
  async save(data) {
    if (typeof indexedDB === 'undefined') return
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

export const recurringExpenseRepository: RecurringExpenseRepository = {
  async load() { return (await indexedDbRepository.load()).recurringExpenses ?? [] },
  async save(expenses) {
    const current = await indexedDbRepository.load()
    await indexedDbRepository.save({ ...current, recurringExpenses: expenses })
  },
}
