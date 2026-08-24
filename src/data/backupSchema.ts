import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD')

const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  initialBalanceCents: z.number().int(),
  color: z.string(),
}).passthrough()

const transactionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['income', 'expense', 'transfer']),
  amountCents: z.number().int().min(0),
  description: z.string().min(1),
  category: z.string().min(1),
  accountId: z.string().min(1),
  date: isoDate,
}).passthrough()

const budgetSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  limitCents: z.number().int().min(0),
}).passthrough()

// Entidades menos críticas: estrutura mínima objeto; migração da store normaliza o resto
const objectArray = z.array(z.record(z.unknown()))

export const BackupFileSchema = z.object({
  app: z.literal('atlas-finance'),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  data: z.object({
    accounts: z.array(accountSchema).max(500),
    transactions: z.array(transactionSchema).max(100000),
    budgets: z.array(budgetSchema).max(2000),
    recurringExpenses: objectArray.max(5000),
    goals: objectArray.max(1000).optional(),
    recurringIncomes: objectArray.max(1000).optional(),
  }).passthrough(),
})

export interface BackupSummary {
  accounts: number
  transactions: number
  recurringExpenses: number
  budgets: number
  goals: number
  exportedAt: string
}

export function summarizeBackup(data: unknown): BackupSummary {
  const d = data as Record<string, unknown[]>
  return {
    accounts: Array.isArray(d.accounts) ? d.accounts.length : 0,
    transactions: Array.isArray(d.transactions) ? d.transactions.length : 0,
    recurringExpenses: Array.isArray(d.recurringExpenses) ? d.recurringExpenses.length : 0,
    budgets: Array.isArray(d.budgets) ? d.budgets.length : 0,
    goals: Array.isArray(d.goals) ? d.goals.length : 0,
    exportedAt: String((data as Record<string, unknown>).exportedAt ?? ''),
  }
}
