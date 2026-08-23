import { describe, expect, it } from 'vitest'
import { getFinanceNotifications } from './notifications'
import type { RecurringExpense } from './recurring'

const recurring: RecurringExpense = {
  id: 'internet', name: 'Internet', amountInCents: 11990, category: 'Assinaturas', accountId: 'account',
  frequency: 'monthly', dueDay: 10, startDate: '2026-01-01', isVariable: false, isActive: true,
  reminderEnabled: true, reminderDaysBefore: 3, createdAt: '2026-01-01', updatedAt: '2026-01-01',
}

describe('notificações financeiras', () => {
  it('avisa sobre gastos recorrentes atrasados', () => {
    const notifications = getFinanceNotifications({ recurringExpenses: [recurring], transactions: [], budgets: [], referenceDate: '2026-08-22' })
    expect(notifications[0]).toMatchObject({ kind: 'overdue', href: '/recurring' })
  })

  it('avisa quando um orçamento está próximo do limite', () => {
    const notifications = getFinanceNotifications({
      recurringExpenses: [], referenceDate: '2026-08-22',
      transactions: [{ id: 'market', type: 'expense', amountCents: 8500, description: 'Mercado', category: 'Alimentação', accountId: 'account', date: '2026-08-20', createdAt: '2026-08-20' }],
      budgets: [{ id: 'food', category: 'Alimentação', month: '2026-08', limitCents: 10000 }],
    })
    expect(notifications).toContainEqual(expect.objectContaining({ kind: 'budget-warning', href: '/planning' }))
  })
})
