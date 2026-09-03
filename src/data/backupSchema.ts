import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD')
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'mês deve ser YYYY-MM')
const recurrence = z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly'])

const accountSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), type: z.enum(['checking','savings','cash','wallet','investment']),
  initialBalanceCents: z.number().int(), color: z.string(), archived: z.boolean().optional(), createdAt: z.string().optional(),
}).passthrough()

const transactionSchema = z.object({
  id: z.string().min(1), type: z.enum(['income', 'expense', 'transfer']), amountCents: z.number().int().min(0),
  description: z.string().min(1), category: z.string().min(1), accountId: z.string().min(1), destinationAccountId: z.string().optional(),
  date: isoDate, recurringExpenseId: z.string().optional(), recurringOccurrenceDate: isoDate.optional(), recurringIncomeId: z.string().optional(), recurringIncomeOccurrenceDate: isoDate.optional(), importExternalId: z.string().optional(),
}).passthrough().superRefine((value, ctx) => {
  if (value.type === 'transfer' && !value.destinationAccountId) ctx.addIssue({ code: 'custom', path: ['destinationAccountId'], message: 'transferência sem conta destino' })
  if (value.type === 'transfer' && value.destinationAccountId === value.accountId) ctx.addIssue({ code: 'custom', path: ['destinationAccountId'], message: 'origem e destino iguais' })
})

const budgetSchema = z.object({ id: z.string().min(1), category: z.string().min(1), month: isoMonth, limitCents: z.number().int().min(0) }).passthrough()

const recurringExpenseSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), amountInCents: z.number().int().positive(), category: z.string().min(1), accountId: z.string().min(1),
  frequency: recurrence, dueDay: z.number().int().min(1).max(31).optional(), startDate: isoDate, endDate: isoDate.optional(),
  isVariable: z.boolean(), isActive: z.boolean(), reminderEnabled: z.boolean(), reminderDaysBefore: z.number().int().min(0).max(365).optional(),
  createdAt: z.string(), updatedAt: z.string(),
}).passthrough().superRefine((value, ctx) => {
  if (!['weekly', 'biweekly'].includes(value.frequency) && !value.dueDay) ctx.addIssue({ code: 'custom', path: ['dueDay'], message: 'dia do vencimento obrigatório' })
  if (value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'data final anterior à inicial' })
})

const recurringIncomeSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), amountInCents: z.number().int().positive(), category: z.string().min(1), accountId: z.string().min(1),
  frequency: recurrence, dueDay: z.number().int().min(1).max(31).optional(), startDate: isoDate, endDate: isoDate.optional(), isActive: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
}).passthrough().superRefine((value, ctx) => {
  if (!['weekly', 'biweekly'].includes(value.frequency) && !value.dueDay) ctx.addIssue({ code: 'custom', path: ['dueDay'], message: 'dia do recebimento obrigatório' })
  if (value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'data final anterior à inicial' })
})

const goalSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), targetAmountInCents: z.number().int().positive(), currentAmountInCents: z.number().int().min(0),
  category: z.string().optional(), accountId: z.string().optional(), deadline: isoDate.optional(), createdAt: z.string(), updatedAt: z.string(),
}).passthrough()

const paymentAllocationItemSchema = z.object({
  id: z.string().min(1), label: z.string().min(1), type: z.enum(['bill','budget','goal','reserve','safety','free']), amountInCents: z.number().int().min(0),
  categoryId: z.string().optional(), goalId: z.string().optional(), recurringExpenseId: z.string().optional(), recurringOccurrenceDate: isoDate.optional(), isConsumed: z.boolean().optional(),
}).passthrough()

const paymentAllocationPlanSchema = z.object({
  id: z.string().min(1), sourceTransactionId: z.string().optional(), receivedAmountInCents: z.number().int().positive(), periodStart: isoDate, periodEnd: isoDate,
  items: z.array(paymentAllocationItemSchema).max(200), freeAmountInCents: z.number().int(), status: z.enum(['draft','applied','cancelled']), createdAt: z.string(), updatedAt: z.string(),
}).passthrough().refine(value => value.periodEnd >= value.periodStart, { message: 'período de organização inválido', path: ['periodEnd'] })

const allocationItemSchema = z.object({
  id: z.string().min(1), type: z.enum(['bill','budget','goal','reserve','free']), label: z.string().min(1), amountInCents: z.number().int().min(0), categoryId: z.string().optional(), recurringExpenseId: z.string().optional(), goalId: z.string().optional(),
}).passthrough()

const allocationPlanSchema = z.object({
  id: z.string().min(1), periodStart: isoDate, periodEnd: isoDate, availableAmountInCents: z.number().int(), allocations: z.array(allocationItemSchema).max(200), createdAt: z.string(), status: z.enum(['draft','applied']), note: z.string().optional(),
}).passthrough()

export const BackupFileSchema = z.object({
  app: z.literal('atlas-finance'),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  data: z.object({
    accounts: z.array(accountSchema).max(500),
    transactions: z.array(transactionSchema).max(100000),
    budgets: z.array(budgetSchema).max(2000),
    recurringExpenses: z.array(recurringExpenseSchema).max(5000),
    recurringIncomes: z.array(recurringIncomeSchema).max(1000).optional().default([]),
    goals: z.array(goalSchema).max(1000).optional().default([]),
    allocationPlans: z.array(allocationPlanSchema).max(1000).optional().default([]),
    paymentAllocationPlans: z.array(paymentAllocationPlanSchema).max(1000).optional().default([]),
    customCategories: z.array(z.string().min(1).max(64)).max(1000).optional().default([]),
    customCategoryIcons: z.record(z.string(), z.string()).optional().default({}),
    readNotificationIds: z.array(z.string()).max(10000).optional().default([]),
    safetyMarginPercent: z.number().min(0).max(50).optional(),
    forecastRealistic: z.boolean().optional(),
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
