import type { FinanceData } from '../domain'
import { emptyData } from '../domain'
import type { RecurringExpense } from '../recurring'

const DB_NAME = 'atlas-finance'
const STORE = 'state'
const KEY = 'finance-data'
const RECOVERY_KEY = 'atlas-finance-recovery-v1'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB'))
  })
}

function readRecovery(): FinanceData | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(RECOVERY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as FinanceData : null
  } catch {
    return null
  }
}

function writeRecovery(data: FinanceData) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(data)) } catch { /* best effort */ }
}

export interface FinanceRepository { load(): Promise<FinanceData>; save(data: FinanceData): Promise<void> }
export interface RecurringExpenseRepository { load(): Promise<RecurringExpense[]>; save(expenses: RecurringExpense[]): Promise<void> }

export const indexedDbRepository: FinanceRepository = {
  async load() {
    if (typeof indexedDB === 'undefined') return readRecovery() ?? emptyData()
    let db: IDBDatabase | null = null
    try {
      db = await openDb()
      const loaded = await new Promise<FinanceData | undefined>((resolve, reject) => {
        const request = db!.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
        request.onsuccess = () => resolve(request.result as FinanceData | undefined)
        request.onerror = () => reject(request.error ?? new Error('Falha ao ler IndexedDB'))
      })
      if (loaded) {
        writeRecovery(loaded)
        return loaded
      }
      return readRecovery() ?? emptyData()
    } catch (error) {
      const recovery = readRecovery()
      if (recovery) return recovery
      throw error
    } finally {
      db?.close()
    }
  },

  async save(data) {
    if (typeof indexedDB === 'undefined') {
      writeRecovery(data)
      return
    }
    let db: IDBDatabase | null = null
    try {
      db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(STORE, 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('Falha ao salvar IndexedDB'))
        tx.onabort = () => reject(tx.error ?? new Error('Gravação IndexedDB abortada'))
        tx.objectStore(STORE).put(data, KEY)
      })
      writeRecovery(data)
    } finally {
      db?.close()
    }
  }
}

export const recurringExpenseRepository: RecurringExpenseRepository = {
  async load() { return (await indexedDbRepository.load()).recurringExpenses ?? [] },
  async save(expenses) {
    const current = await indexedDbRepository.load()
    await indexedDbRepository.save({ ...current, recurringExpenses: expenses })
  },
}
