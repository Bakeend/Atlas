import type { FinanceData } from '../domain'
import type { RecurringExpense } from '../recurring'
import { sqlRepository } from './sqlRepository'

// Re-exporta o repositório SQL como principal
// Mantém o nome legado `indexedDbRepository` para compatibilidade com o store existente
// Agora ambos apontam para a implementação SQL local

export interface FinanceRepository { load(): Promise<FinanceData>; save(data: FinanceData): Promise<void> }
export interface RecurringExpenseRepository { load(): Promise<RecurringExpense[]>; save(expenses: RecurringExpense[]): Promise<void> }

export const indexedDbRepository: FinanceRepository = sqlRepository
export { sqlRepository }

export const recurringExpenseRepository: RecurringExpenseRepository = {
  async load() { return (await sqlRepository.load()).recurringExpenses ?? [] },
  async save(expenses) {
    const current = await sqlRepository.load()
    await sqlRepository.save({ ...current, recurringExpenses: expenses })
  },
}

// Alias explícito para novo código que prefere nome SQL
export const financeRepository = sqlRepository
