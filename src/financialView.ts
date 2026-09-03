import type { Budget, FinanceTransaction, RecurringExpense, RecurringIncome } from './domain'
import { getOccurrencesBetween, getUnrecordedOccurrencesBetween } from './recurring'

export interface CategoryExpenseView {
  category: string
  realizedCents: number
  committedCents: number
  projectedCents: number
}

export interface ExpenseView {
  realizedCents: number
  committedCents: number
  projectedCents: number
  byCategory: CategoryExpenseView[]
}

export interface IncomeView {
  realizedCents: number
  committedCents: number
  projectedCents: number
}

export interface BudgetUsageView {
  category: string
  month: string
  limitCents: number
  realizedCents: number
  committedCents: number
  projectedCents: number
  remainingCents: number
  percentProjected: number
}

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const last = new Date(year, monthNumber, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` }
}

export function calculateExpenseView({
  transactions,
  recurringExpenses,
  startDate,
  endDate,
}: {
  transactions: FinanceTransaction[]
  recurringExpenses: RecurringExpense[]
  startDate: string
  endDate: string
}): ExpenseView {
  const liveExpenses = transactions.filter(t => !t.deletedAt && t.type === 'expense' && t.date >= startDate && t.date <= endDate)
  const categoryMap = new Map<string, { realizedCents: number; committedCents: number }>()

  for (const transaction of liveExpenses) {
    const category = transaction.category || 'Outros'
    const current = categoryMap.get(category) ?? { realizedCents: 0, committedCents: 0 }
    current.realizedCents += transaction.amountCents
    categoryMap.set(category, current)
  }

  for (const recurring of recurringExpenses) {
    if (!recurring.isActive) continue
    const occurrences = getUnrecordedOccurrencesBetween(recurring, startDate, endDate, transactions)
    if (!occurrences.length) continue
    const category = recurring.category || 'Outros'
    const current = categoryMap.get(category) ?? { realizedCents: 0, committedCents: 0 }
    current.committedCents += occurrences.length * recurring.amountInCents
    categoryMap.set(category, current)
  }

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, values]) => ({
      category,
      realizedCents: values.realizedCents,
      committedCents: values.committedCents,
      projectedCents: values.realizedCents + values.committedCents,
    }))
    .sort((a, b) => b.projectedCents - a.projectedCents)

  const realizedCents = byCategory.reduce((sum, item) => sum + item.realizedCents, 0)
  const committedCents = byCategory.reduce((sum, item) => sum + item.committedCents, 0)
  return { realizedCents, committedCents, projectedCents: realizedCents + committedCents, byCategory }
}

export function calculateIncomeView({
  transactions,
  recurringIncomes,
  startDate,
  endDate,
}: {
  transactions: FinanceTransaction[]
  recurringIncomes: RecurringIncome[]
  startDate: string
  endDate: string
}): IncomeView {
  const realizedCents = transactions
    .filter(t => !t.deletedAt && t.type === 'income' && t.date >= startDate && t.date <= endDate)
    .reduce((sum, transaction) => sum + transaction.amountCents, 0)

  let committedCents = 0
  for (const income of recurringIncomes) {
    if (!income.isActive) continue
    const occurrences = getOccurrencesBetween(income as RecurringExpense, startDate, endDate)
    for (const occurrenceDate of occurrences) {
      const alreadyReceived = transactions.some(transaction =>
        !transaction.deletedAt &&
        transaction.type === 'income' &&
        transaction.recurringIncomeId === income.id &&
        transaction.recurringIncomeOccurrenceDate === occurrenceDate
      )
      if (!alreadyReceived) committedCents += income.amountInCents
    }
  }

  return { realizedCents, committedCents, projectedCents: realizedCents + committedCents }
}

export function calculateMonthlyExpenseView(transactions: FinanceTransaction[], recurringExpenses: RecurringExpense[], month: string) {
  const { start, end } = monthBounds(month)
  return calculateExpenseView({ transactions, recurringExpenses, startDate: start, endDate: end })
}

export function calculateMonthlyIncomeView(transactions: FinanceTransaction[], recurringIncomes: RecurringIncome[], month: string) {
  const { start, end } = monthBounds(month)
  return calculateIncomeView({ transactions, recurringIncomes, startDate: start, endDate: end })
}

export function calculateBudgetUsage({
  budget,
  transactions,
  recurringExpenses,
}: {
  budget: Budget
  transactions: FinanceTransaction[]
  recurringExpenses: RecurringExpense[]
}): BudgetUsageView {
  const monthView = calculateMonthlyExpenseView(transactions, recurringExpenses, budget.month)
  const category = monthView.byCategory.find(item => item.category === budget.category)
  const realizedCents = category?.realizedCents ?? 0
  const committedCents = category?.committedCents ?? 0
  const projectedCents = realizedCents + committedCents
  const remainingCents = Math.max(0, budget.limitCents - projectedCents)
  const percentProjected = budget.limitCents > 0 ? Math.round((projectedCents / budget.limitCents) * 100) : 0
  return { category: budget.category, month: budget.month, limitCents: budget.limitCents, realizedCents, committedCents, projectedCents, remainingCents, percentProjected }
}

export function calculateRemainingEssentialBudgets({
  budgets,
  transactions,
  recurringExpenses,
  startMonth,
  endMonth,
  essentialCategories,
}: {
  budgets: Budget[]
  transactions: FinanceTransaction[]
  recurringExpenses: RecurringExpense[]
  startMonth: string
  endMonth: string
  essentialCategories: Set<string>
}) {
  let total = 0
  const details: BudgetUsageView[] = []
  for (const budget of budgets) {
    if (budget.month < startMonth || budget.month > endMonth || !essentialCategories.has(budget.category)) continue
    const usage = calculateBudgetUsage({ budget, transactions, recurringExpenses })
    total += usage.remainingCents
    details.push(usage)
  }
  return { total, details }
}
