import { describe, expect, it } from 'vitest'
import { calculateForecast, getAverageDailyVariable } from '../forecast/calculate'
import type { Account, FinanceTransaction } from '../domain'
import type { RecurringExpense } from '../recurring'

const account: Account = { id: 'a1', name: 'Conta', type: 'checking', initialBalanceCents: 100000, color: '#2F80ED', archived: false, createdAt: '2026-01-01' }

describe('forecast calculate', () => {
  it('recurring-only subtracts occurrences', () => {
    const recurring: RecurringExpense[] = [
      { id: 'r1', name: 'Aluguel', amountInCents: 50000, category: 'Moradia', accountId: 'a1', frequency: 'monthly', dueDay: 5, startDate: '2026-08-01', isVariable: false, isActive: true, reminderEnabled: false, createdAt: '2026-08-01', updatedAt: '2026-08-01' },
    ]
    const points = calculateForecast({ accounts: [account], transactions: [], recurringExpenses: recurring, startDate: '2026-08-01', days: 10, realistic: false })
    // day 5 has recurring, balance should drop 50000 on that day
    expect(points[4].recurringCents).toBe(50000)
    expect(points[4].balance).toBe(50000) // 100000 -50000
    expect(points[0].balance).toBe(100000)
  })

  it('realistic adds variable average', () => {
    const tx: FinanceTransaction[] = [
      // 2 days of expense 1000 cents each, within 90d window of 2026-08-10
      { id: 't1', type: 'expense', amountCents: 5000, description: 'Mercado', category: 'Alimentação', accountId: 'a1', date: '2026-07-15', createdAt: '2026-07-15' },
      { id: 't2', type: 'expense', amountCents: 4000, description: 'Uber', category: 'Transporte', accountId: 'a1', date: '2026-08-01', createdAt: '2026-08-01' },
    ]
    const avg = getAverageDailyVariable(tx, '2026-08-10', 90)
    expect(avg.avgExpense).toBe(Math.round(9000 / 90))
    const points = calculateForecast({ accounts: [account], transactions: tx, recurringExpenses: [], startDate: '2026-08-10', days: 2, realistic: true })
    expect(points[0].variableCents).toBe(avg.avgIncome - avg.avgExpense)
  })

  it('inactive recurring ignored', () => {
    const recurring: RecurringExpense[] = [
      { id: 'r1', name: 'Old', amountInCents: 10000, category: 'Outros', accountId: 'a1', frequency: 'monthly', dueDay: 1, startDate: '2026-08-01', isVariable: false, isActive: false, reminderEnabled: false, createdAt: '2026-08-01', updatedAt: '2026-08-01' },
    ]
    const points = calculateForecast({ accounts: [account], transactions: [], recurringExpenses: recurring, startDate: '2026-08-01', days: 5, realistic: false })
    expect(points.every(p => p.recurringCents === 0)).toBe(true)
  })
})
