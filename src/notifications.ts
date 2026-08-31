import type { Budget, FinanceTransaction } from './domain'
import type { RecurringExpense } from './recurring'
import { getNextUnrecordedOccurrence, getUnrecordedOccurrencesBetween } from './recurring'

export type NotificationKind =
  | 'overdue'
  | 'reminder'
  | 'budget-warning'
  | 'budget-exceeded'
  | 'daily-overspent'
  | 'forecast-negative'
  | 'anomaly'
  | 'goal-overdue'
  | 'recurring-increase'
  | 'free-money-drop'
  | 'goal-opportunity'
  | 'card-closing-soon'
  | 'card-due-soon'
  | 'card-overdue'
  | 'card-limit-warning'
  | 'card-limit-critical'
  | 'card-limit-exhausted'
  | 'card-invoice-increase'
  | 'card-installment-ending'
  | 'card-partially-paid'

export interface FinanceNotification {
  id: string
  kind: NotificationKind
  title: string
  message: string
  date: string
  href: string
}

const addDays = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return date.toISOString().slice(0, 10)
}

const spentByCategory = (transactions: FinanceTransaction[], month: string, category: string) => transactions
  .filter(item => !item.deletedAt && item.type === 'expense' && item.date.startsWith(month) && item.category === category)
  .reduce((total, item) => total + item.amountCents, 0)

export function getFinanceNotifications({
  recurringExpenses, transactions, budgets, referenceDate,
}: {
  recurringExpenses: RecurringExpense[]
  transactions: FinanceTransaction[]
  budgets: Budget[]
  referenceDate: string
}): FinanceNotification[] {
  const month = referenceDate.slice(0, 7)
  const recurring: FinanceNotification[] = recurringExpenses.flatMap<FinanceNotification>(expense => {
    if (!expense.isActive) return []
    const overdue = getUnrecordedOccurrencesBetween(expense, expense.startDate, addDays(referenceDate, -1), transactions)[0]
    if (overdue) return [{
      id: `recurring-overdue:${expense.id}:${overdue}`, kind: 'overdue',
      title: `${expense.name} está em atraso`, message: `Venceu em ${formatDate(overdue)} e ainda não foi registrado.`, date: overdue, href: '/recurring',
    }]
    if (!expense.reminderEnabled) return []
    const next = getNextUnrecordedOccurrence(expense, referenceDate, transactions)
    const reminderDate = next && addDays(next, -(expense.reminderDaysBefore ?? 0))
    if (!next || !reminderDate || reminderDate > referenceDate) return []
    return [{
      id: `recurring-reminder:${expense.id}:${next}`, kind: 'reminder',
      title: `${expense.name} vence em breve`, message: `Vencimento em ${formatDate(next)}.`, date: next, href: '/recurring',
    }]
  })

  const budgetAlerts: FinanceNotification[] = budgets.filter(budget => budget.month === month).flatMap<FinanceNotification>(budget => {
    const spent = spentByCategory(transactions, month, budget.category)
    if (spent < budget.limitCents * 0.8) return []
    const exceeded = spent >= budget.limitCents
    return [{
      id: `budget:${budget.id}:${month}:${exceeded ? 'exceeded' : 'warning'}`,
      kind: exceeded ? 'budget-exceeded' : 'budget-warning',
      title: exceeded ? `Orçamento de ${budget.category} excedido` : `Orçamento de ${budget.category} em alerta`,
      message: exceeded ? 'Você atingiu ou ultrapassou o limite mensal.' : 'Você já utilizou mais de 80% do limite mensal.',
      date: referenceDate, href: '/planning',
    }]
  })

  return [...recurring, ...budgetAlerts].sort((a, b) => {
    const weight = (item: FinanceNotification) => item.kind === 'overdue' ? 0 : item.kind === 'budget-exceeded' ? 1 : item.kind === 'forecast-negative' ? 1 : 2
    return weight(a) - weight(b) || a.date.localeCompare(b.date)
  })
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(`${value}T12:00:00`)).replace('.', '')
}
