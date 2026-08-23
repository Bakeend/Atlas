import { z } from 'zod'

// Shared helpers
export const centsSchema = z.number().int().min(1).max(100_000_000_00)
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM')

// --- READ schemas (often no params or simple) ---
export const getTransactionsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  type: z.enum(['income', 'expense', 'transfer', 'all']).optional(),
  category: z.string().optional(),
  accountId: z.string().optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  query: z.string().optional(),
})

export const getTransactionsByPeriodSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  type: z.enum(['income', 'expense', 'transfer', 'all']).optional().default('all'),
})

export const getTransactionsByCategorySchema = z.object({
  category: z.string().min(1),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
})

export const getFinancialSummarySchema = z.object({})
export const getAccountsSchema = z.object({})
export const getAccountBalancesSchema = z.object({})
export const getCategoriesSchema = z.object({})
export const getBudgetsSchema = z.object({ month: monthSchema.optional() })
export const getBudgetStatusSchema = z.object({ month: monthSchema.optional() })
export const getRecurringExpensesSchema = z.object({ activeOnly: z.boolean().optional() })
export const getRecurringIncomeSchema = z.object({ activeOnly: z.boolean().optional() })
export const getGoalsSchema = z.object({})
export const getSpendingAnalysisSchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  groupBy: z.enum(['category', 'month']).optional().default('category'),
})
export const getSpendingAnomaliesSchema = z.object({ months: z.number().int().min(2).max(12).optional().default(6) })
export const getCashFlowForecastSchema = z.object({ days: z.number().int().min(7).max(90).optional().default(30), realistic: z.boolean().optional().default(true) })
export const getAvailableMoneySchema = z.object({ untilDate: dateSchema.optional() })
export const getCommittedAmountSchema = z.object({ startDate: dateSchema.optional(), endDate: dateSchema.optional() })
export const getNextIncomeSchema = z.object({})
export const getUpcomingCommitmentsSchema = z.object({ days: z.number().int().min(1).max(90).optional().default(30) })

// --- WRITE schemas ---
export const createCategorySchema = z.object({ name: z.string().trim().min(2).max(32) })
export const updateCategorySchema = z.object({ oldName: z.string().min(1), newName: z.string().trim().min(2).max(32) })

export const createTransactionSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  amountInCents: centsSchema,
  description: z.string().trim().min(2).max(80),
  category: z.string().trim().min(1).max(32),
  accountId: z.string().min(1),
  destinationAccountId: z.string().optional(),
  date: dateSchema,
  note: z.string().max(200).optional(),
  recurringExpenseId: z.string().optional(),
  recurringOccurrenceDate: dateSchema.optional(),
}).superRefine((v, ctx) => {
  if (v.type === 'transfer' && !v.destinationAccountId) ctx.addIssue({ code: 'custom', message: 'Transferência requer destinationAccountId', path: ['destinationAccountId'] })
  if (v.type === 'transfer' && v.accountId === v.destinationAccountId) ctx.addIssue({ code: 'custom', message: 'Origem e destino devem ser diferentes', path: ['destinationAccountId'] })
  if (v.type !== 'transfer' && v.destinationAccountId) ctx.addIssue({ code: 'custom', message: 'destinationAccountId só para transfer', path: ['destinationAccountId'] })
})

export const updateTransactionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  amountInCents: centsSchema.optional(),
  description: z.string().trim().min(2).max(80).optional(),
  category: z.string().trim().min(1).max(32).optional(),
  accountId: z.string().optional(),
  destinationAccountId: z.string().optional(),
  date: dateSchema.optional(),
  note: z.string().max(200).optional(),
})

export const deleteTransactionSchema = z.object({ id: z.string().min(1) })

export const createRecurringExpenseSchema = z.object({
  name: z.string().trim().min(2).max(60),
  amountInCents: centsSchema,
  category: z.string().trim().min(1).max(32),
  accountId: z.string().min(1),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly']),
  dueDay: z.number().int().min(1).max(31).optional(),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  description: z.string().max(120).optional(),
  isVariable: z.boolean().optional().default(false),
  reminderEnabled: z.boolean().optional().default(false),
  reminderDaysBefore: z.number().int().min(0).max(30).optional(),
}).superRefine((v, ctx) => {
  if (!['weekly', 'biweekly'].includes(v.frequency) && !v.dueDay) ctx.addIssue({ code: 'custom', message: 'dueDay obrigatório para frequência mensal+', path: ['dueDay'] })
})

export const updateRecurringExpenseSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  amountInCents: centsSchema.optional(),
  category: z.string().trim().min(1).max(32).optional(),
  accountId: z.string().optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly']).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  description: z.string().max(120).optional(),
  isVariable: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderDaysBefore: z.number().int().min(0).max(30).optional(),
  isActive: z.boolean().optional(),
})

export const deleteRecurringExpenseSchema = z.object({ id: z.string().min(1) })
export const pauseRecurringExpenseSchema = z.object({ id: z.string().min(1) })
export const resumeRecurringExpenseSchema = z.object({ id: z.string().min(1) })

export const createRecurringIncomeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  amountInCents: centsSchema,
  category: z.string().trim().min(1).max(32),
  accountId: z.string().min(1),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly']),
  dueDay: z.number().int().min(1).max(31).optional(),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  description: z.string().max(120).optional(),
})

export const updateRecurringIncomeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  amountInCents: centsSchema.optional(),
  category: z.string().trim().min(1).max(32).optional(),
  accountId: z.string().optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly']).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  description: z.string().max(120).optional(),
  isActive: z.boolean().optional(),
})

export const deleteRecurringIncomeSchema = z.object({ id: z.string().min(1) })

export const createBudgetSchema = z.object({
  category: z.string().trim().min(1).max(32),
  month: monthSchema,
  limitCents: centsSchema,
})

export const updateBudgetSchema = z.object({
  id: z.string().min(1),
  category: z.string().trim().min(1).max(32).optional(),
  month: monthSchema.optional(),
  limitCents: centsSchema.optional(),
})

export const deleteBudgetSchema = z.object({ id: z.string().min(1) })

export const createGoalSchema = z.object({
  title: z.string().trim().min(2).max(60),
  targetAmountInCents: centsSchema,
  currentAmountInCents: z.number().int().min(0).optional().default(0),
  category: z.string().max(32).optional(),
  accountId: z.string().optional(),
  deadline: dateSchema.optional(),
})

export const updateGoalSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(2).max(60).optional(),
  targetAmountInCents: centsSchema.optional(),
  currentAmountInCents: z.number().int().min(0).optional(),
  category: z.string().max(32).optional(),
  accountId: z.string().optional(),
  deadline: dateSchema.optional(),
})

export const deleteGoalSchema = z.object({ id: z.string().min(1) })

export const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(40),
  type: z.enum(['checking', 'savings', 'cash', 'wallet', 'investment']),
  initialBalanceCents: z.number().int().min(0).optional().default(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#2F80ED'),
})

export const updateAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(40).optional(),
  type: z.enum(['checking', 'savings', 'cash', 'wallet', 'investment']).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  archived: z.boolean().optional(),
})

export const deleteAccountSchema = z.object({ id: z.string().min(1) })

export const createAllocationPlanSchema = z.object({
  periodStart: dateSchema,
  periodEnd: dateSchema,
  note: z.string().max(200).optional(),
  allocations: z.array(z.object({
    type: z.enum(['bill', 'budget', 'goal', 'reserve', 'free']),
    label: z.string().trim().min(1).max(60),
    amountInCents: z.number().int().min(0),
    categoryId: z.string().optional(),
    recurringExpenseId: z.string().optional(),
    goalId: z.string().optional(),
  })).min(1).max(20),
}).superRefine((v, ctx) => {
  if (v.periodEnd <= v.periodStart) ctx.addIssue({ code: 'custom', message: 'periodEnd deve ser após periodStart', path: ['periodEnd'] })
})

export const applyAllocationPlanSchema = z.object({ id: z.string().min(1) })
export const deleteAllocationPlanSchema = z.object({ id: z.string().min(1) })

// Helpers for money conversion validation
export function validateCents(cents: number) {
  return Number.isInteger(cents) && cents > 0
}

// Category duplication helper — normalized
export function normalizeCategory(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

export const categoryAliases: Record<string, string> = {
  mercado: 'Alimentação',
  supermercado: 'Alimentação',
  comida: 'Alimentação',
  alimentos: 'Alimentação',
  alimentacao: 'Alimentação',
  alimentacoes: 'Alimentação',
  moradia: 'Moradia',
  aluguel: 'Moradia',
  casa: 'Moradia',
  transporte: 'Transporte',
  gasolina: 'Transporte',
  combustivel: 'Transporte',
  uber: 'Transporte',
  saude: 'Saúde',
  saúde: 'Saúde',
  lazer: 'Lazer',
  educacao: 'Educação',
  educação: 'Educação',
  faculdade: 'Educação',
  assinaturas: 'Assinaturas',
  assinatura: 'Assinaturas',
  streaming: 'Assinaturas',
  netflix: 'Assinaturas',
  internet: 'Assinaturas',
}
