import type { FinanceTransaction, RecurrenceFrequency, RecurringExpense } from './domain'
export type { RecurrenceFrequency, RecurringExpense } from './domain'

export const recurrenceFrequencies: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'yearly', label: 'Anual' },
]

const DAY_MS = 86_400_000
const dateOnly = (value: string | Date) => typeof value === 'string' ? new Date(`${value}T12:00:00`) : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12)
export const toISODate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const compare = (a: Date, b: Date) => toISODate(a).localeCompare(toISODate(b))
const lastDayOfMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

export function validDueDate(year: number, month: number, dueDay: number) {
  return new Date(year, month, Math.min(Math.max(1, dueDay), lastDayOfMonth(year, month)), 12)
}

function monthInterval(frequency: RecurrenceFrequency) {
  return ({ monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 } as Partial<Record<RecurrenceFrequency, number>>)[frequency]
}

export function getNextOccurrence(expense: RecurringExpense, referenceDate: string | Date): string | undefined {
  if (!expense.isActive) return undefined
  const reference = dateOnly(referenceDate)
  const start = dateOnly(expense.startDate)
  const target = compare(reference, start) < 0 ? start : reference
  const end = expense.endDate ? dateOnly(expense.endDate) : undefined
  let candidate: Date

  if (expense.frequency === 'weekly' || expense.frequency === 'biweekly') {
    const step = expense.frequency === 'weekly' ? 7 : 14
    const elapsed = Math.max(0, Math.floor((target.getTime() - start.getTime()) / DAY_MS))
    const jumps = Math.ceil(elapsed / step)
    candidate = addDays(start, jumps * step)
    if (compare(candidate, target) < 0) candidate = addDays(candidate, step)
  } else {
    const interval = monthInterval(expense.frequency) ?? 1
    const startMonthIndex = start.getFullYear() * 12 + start.getMonth()
    const targetMonthIndex = target.getFullYear() * 12 + target.getMonth()
    let jumps = Math.max(0, Math.floor((targetMonthIndex - startMonthIndex) / interval))
    let monthIndex = startMonthIndex + jumps * interval
    const dueDay = expense.dueDay ?? start.getDate()
    candidate = validDueDate(Math.floor(monthIndex / 12), monthIndex % 12, dueDay)
    if (compare(candidate, start) < 0 || compare(candidate, target) < 0) {
      jumps += 1
      monthIndex = startMonthIndex + jumps * interval
      candidate = validDueDate(Math.floor(monthIndex / 12), monthIndex % 12, dueDay)
    }
  }

  if (compare(candidate, start) < 0 || (end && compare(candidate, end) > 0)) return undefined
  return toISODate(candidate)
}

export function getOccurrencesBetween(expense: RecurringExpense, startDate: string | Date, endDate: string | Date): string[] {
  if (!expense.isActive) return []
  const end = dateOnly(endDate)
  let cursor = dateOnly(startDate)
  const result: string[] = []
  for (let guard = 0; guard < 600; guard += 1) {
    const occurrence = getNextOccurrence(expense, cursor)
    if (!occurrence || compare(dateOnly(occurrence), end) > 0) break
    result.push(occurrence)
    cursor = addDays(dateOnly(occurrence), 1)
  }
  return result
}

export function isOccurrenceRecorded(transactions: FinanceTransaction[], recurringExpenseId: string, occurrenceDate: string) {
  return transactions.some(transaction => !transaction.deletedAt && transaction.recurringExpenseId === recurringExpenseId && transaction.recurringOccurrenceDate === occurrenceDate)
}

export function getUnrecordedOccurrencesBetween(expense: RecurringExpense, startDate: string | Date, endDate: string | Date, transactions: FinanceTransaction[]) {
  return getOccurrencesBetween(expense, startDate, endDate).filter(date => !isOccurrenceRecorded(transactions, expense.id, date))
}

export function calculateCommittedAmount(expenses: RecurringExpense[], startDate: string | Date, endDate: string | Date, transactions: FinanceTransaction[] = []) {
  return expenses.filter(expense => expense.isActive).reduce((total, expense) => total + getUnrecordedOccurrencesBetween(expense, startDate, endDate, transactions).length * expense.amountInCents, 0)
}

export function getNextUnrecordedOccurrence(expense: RecurringExpense, referenceDate: string | Date, transactions: FinanceTransaction[], horizonDays = 730) {
  const start = dateOnly(referenceDate)
  const end = addDays(start, horizonDays)
  return getUnrecordedOccurrencesBetween(expense, start, end, transactions)[0]
}

export function frequencyLabel(frequency: RecurrenceFrequency) {
  return recurrenceFrequencies.find(item => item.value === frequency)?.label ?? frequency
}
