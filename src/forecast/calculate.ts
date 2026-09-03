import { accountBalance, type FinanceTransaction, type RecurringIncome } from '../domain'
import type { Account } from '../domain'
import { getOccurrencesBetween, getUnrecordedOccurrencesBetween, type RecurringExpense } from '../recurring'

export interface ForecastPoint {
  date: string // YYYY-MM-DD
  label: string // 22 Ago
  balance: number // cents
  recurringCents: number // expense cents impact that day
  recurringIncomeCents: number // income cents impact that day
  variableCents: number // cents impact that day from average (0 if recurring-only)
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatLabel(dateIso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${dateIso}T12:00:00`)).replace('.', '')
}

export function getAverageDailyVariable(transactions: FinanceTransaction[], referenceDate: string, lookbackDays = 90) {
  const end = referenceDate
  const start = addDaysIso(referenceDate, -lookbackDays)
  // Recurring expenses/incomes are projected explicitly and must not leak into the variable average.
  const windowTx = transactions.filter(t => !t.deletedAt && !t.recurringExpenseId && !t.recurringIncomeId && t.date >= start && t.date <= end && (t.type === 'expense' || t.type === 'income'))
  if (!windowTx.length) return { avgExpense: 0, avgIncome: 0, sampleDays: lookbackDays }
  const expense = windowTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0)
  const income = windowTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amountCents, 0)
  return { avgExpense: Math.round(expense / lookbackDays), avgIncome: Math.round(income / lookbackDays), sampleDays: lookbackDays }
}

export interface ForecastInput {
  accounts: Account[]
  transactions: FinanceTransaction[]
  recurringExpenses: RecurringExpense[]
  recurringIncomes?: RecurringIncome[]
  startDate: string // inclusive, usually today
  days: number // 30 or 90
  realistic: boolean // false = only recurring, true = hybrid
}

function getUnrecordedIncomeOccurrences(income: RecurringIncome, startDate: string, endDate: string, transactions: FinanceTransaction[]) {
  const occurrences = getOccurrencesBetween(income as RecurringExpense, startDate, endDate)
  return occurrences.filter(occurrenceDate => !transactions.some(transaction =>
    !transaction.deletedAt &&
    transaction.type === 'income' &&
    transaction.recurringIncomeId === income.id &&
    transaction.recurringIncomeOccurrenceDate === occurrenceDate
  ))
}

export function calculateForecast(input: ForecastInput): ForecastPoint[] {
  const { accounts, transactions, recurringExpenses, recurringIncomes = [], startDate, days, realistic } = input
  const activeAccounts = accounts.filter(a => !a.archived)
  const live = transactions.filter(t => !t.deletedAt)
  const currentBalance = activeAccounts.reduce((s, acc) => s + accountBalance(acc, live), 0)

  const avg = realistic ? getAverageDailyVariable(transactions, startDate) : { avgExpense: 0, avgIncome: 0, sampleDays: 0 }
  const netVariableDaily = avg.avgIncome - avg.avgExpense

  const endDate = addDaysIso(startDate, days - 1)
  const recurringExpenseByDate = new Map<string, number>()
  const recurringIncomeByDate = new Map<string, number>()

  for (const expense of recurringExpenses) {
    if (!expense.isActive) continue
    const occurrences = getUnrecordedOccurrencesBetween(expense, startDate, endDate, transactions)
    for (const date of occurrences) {
      recurringExpenseByDate.set(date, (recurringExpenseByDate.get(date) ?? 0) + expense.amountInCents)
    }
  }

  for (const income of recurringIncomes) {
    if (!income.isActive) continue
    const occurrences = getUnrecordedIncomeOccurrences(income, startDate, endDate, transactions)
    for (const date of occurrences) {
      recurringIncomeByDate.set(date, (recurringIncomeByDate.get(date) ?? 0) + income.amountInCents)
    }
  }

  const points: ForecastPoint[] = []
  let running = currentBalance
  for (let i = 0; i < days; i++) {
    const date = addDaysIso(startDate, i)
    const recurringCents = recurringExpenseByDate.get(date) ?? 0
    const recurringIncomeCents = recurringIncomeByDate.get(date) ?? 0
    const variableCents = realistic ? netVariableDaily : 0
    running = running - recurringCents + recurringIncomeCents + variableCents
    points.push({
      date,
      label: formatLabel(date),
      balance: running,
      recurringCents,
      recurringIncomeCents,
      variableCents,
    })
  }
  return points
}

export function summarizeForecast(points: ForecastPoint[], startBalance: number) {
  if (!points.length) return { endBalance: startBalance, minBalance: startBalance, maxBalance: startBalance, totalRecurring: 0, totalRecurringIncome: 0, totalVariable: 0 }
  const endBalance = points[points.length - 1].balance
  const minBalance = Math.min(...points.map(p => p.balance), startBalance)
  const maxBalance = Math.max(...points.map(p => p.balance), startBalance)
  const totalRecurring = points.reduce((s, p) => s + p.recurringCents, 0)
  const totalRecurringIncome = points.reduce((s, p) => s + p.recurringIncomeCents, 0)
  const totalVariable = points.reduce((s, p) => s + p.variableCents, 0)
  return { endBalance, minBalance, maxBalance, totalRecurring, totalRecurringIncome, totalVariable }
}
