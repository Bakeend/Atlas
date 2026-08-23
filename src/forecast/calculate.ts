import { accountBalance, type FinanceTransaction } from '../domain'
import type { Account } from '../domain'
import { getUnrecordedOccurrencesBetween, type RecurringExpense } from '../recurring'

export interface ForecastPoint {
  date: string // YYYY-MM-DD
  label: string // 22 Ago
  balance: number // cents
  recurringCents: number // cents impact that day from recurring
  variableCents: number // cents impact that day from average (0 if recurring-only)
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatLabel(dateIso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${dateIso}T12:00:00`)).replace('.', '')
}

export function getAverageDailyVariable(transactions: FinanceTransaction[], referenceDate: string, lookbackDays = 90) {
  const end = referenceDate
  const start = addDaysIso(referenceDate, -lookbackDays)
  // consider only non-deleted, non-recurring linked, expense/income (ignore transfer)
  const windowTx = transactions.filter(t => !t.deletedAt && !t.recurringExpenseId && t.date >= start && t.date <= end && (t.type === 'expense' || t.type === 'income'))
  if (!windowTx.length) return { avgExpense: 0, avgIncome: 0, sampleDays: lookbackDays }
  const expense = windowTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0)
  const income = windowTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amountCents, 0)
  // average per day over lookback window (not per transaction day)
  return { avgExpense: Math.round(expense / lookbackDays), avgIncome: Math.round(income / lookbackDays), sampleDays: lookbackDays }
}

export interface ForecastInput {
  accounts: Account[]
  transactions: FinanceTransaction[]
  recurringExpenses: RecurringExpense[]
  startDate: string // inclusive, usually today
  days: number // 30 or 90
  realistic: boolean // false = only recurring, true = hybrid
}

export function calculateForecast(input: ForecastInput): ForecastPoint[] {
  const { accounts, transactions, recurringExpenses, startDate, days, realistic } = input
  const activeAccounts = accounts.filter(a => !a.archived)
  const live = transactions.filter(t => !t.deletedAt)
  const currentBalance = activeAccounts.reduce((s, acc) => s + accountBalance(acc, live), 0)

  const avg = realistic ? getAverageDailyVariable(transactions, startDate) : { avgExpense: 0, avgIncome: 0, sampleDays: 0 }
  const netVariableDaily = avg.avgIncome - avg.avgExpense

  // Precompute recurring impact per date
  // For performance, collect all occurrences in window
  const endDate = addDaysIso(startDate, days - 1)
  const recurringByDate = new Map<string, number>()
  for (const expense of recurringExpenses) {
    if (!expense.isActive) continue
    const occ = getUnrecordedOccurrencesBetween(expense, startDate, endDate, transactions)
    for (const d of occ) {
      recurringByDate.set(d, (recurringByDate.get(d) ?? 0) + expense.amountInCents)
    }
  }

  const points: ForecastPoint[] = []
  let running = currentBalance
  for (let i = 0; i < days; i++) {
    const date = addDaysIso(startDate, i)
    const recurringCents = recurringByDate.get(date) ?? 0
    const variableCents = realistic ? netVariableDaily : 0
    // recurring are expenses, so subtract; variable net already income - expense
    running = running - recurringCents + (realistic ? variableCents : 0)
    points.push({
      date,
      label: formatLabel(date),
      balance: running,
      recurringCents,
      variableCents: realistic ? variableCents : 0,
    })
  }
  return points
}

export function summarizeForecast(points: ForecastPoint[], startBalance: number) {
  if (!points.length) return { endBalance: startBalance, minBalance: startBalance, maxBalance: startBalance, totalRecurring: 0, totalVariable: 0 }
  const endBalance = points[points.length - 1].balance
  const minBalance = Math.min(...points.map(p => p.balance), startBalance)
  const maxBalance = Math.max(...points.map(p => p.balance), startBalance)
  const totalRecurring = points.reduce((s, p) => s + p.recurringCents, 0)
  const totalVariable = points.reduce((s, p) => s + p.variableCents, 0)
  return { endBalance, minBalance, maxBalance, totalRecurring, totalVariable }
}
