import { describe, expect, it } from 'vitest'
import { accountBalance, type Account, type FinanceTransaction } from '../domain'
import {
  calculateCommittedAmount, getNextOccurrence, getOccurrencesBetween,
  getUnrecordedOccurrencesBetween, type RecurringExpense,
} from '../recurring'

const base: RecurringExpense = {
  id: 'internet', name: 'Internet', amountInCents: 11990, category: 'Assinaturas',
  accountId: 'account', frequency: 'monthly', dueDay: 10, startDate: '2026-01-01',
  isVariable: false, isActive: true, reminderEnabled: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('regras de gastos recorrentes', () => {
  it('calcula a próxima ocorrência mensal', () => {
    expect(getNextOccurrence(base, '2026-08-22')).toBe('2026-09-10')
  })

  it('usa o último dia válido quando o vencimento é dia 31', () => {
    expect(getNextOccurrence({ ...base, dueDay: 31 }, '2027-02-01')).toBe('2027-02-28')
    expect(getNextOccurrence({ ...base, dueDay: 31 }, '2028-02-01')).toBe('2028-02-29')
  })

  it('não prevê uma recorrência pausada', () => {
    const paused = { ...base, isActive: false }
    expect(getNextOccurrence(paused, '2026-08-01')).toBeUndefined()
    expect(getOccurrencesBetween(paused, '2026-08-01', '2026-12-31')).toEqual([])
  })

  it('não gera datas posteriores ao encerramento', () => {
    const ended = { ...base, endDate: '2026-08-10' }
    expect(getOccurrencesBetween(ended, '2026-07-01', '2026-12-31')).toEqual(['2026-07-10', '2026-08-10'])
    expect(getNextOccurrence(ended, '2026-08-11')).toBeUndefined()
  })

  it('soma somente as ocorrências válidas no período', () => {
    const rent = { ...base, id: 'rent', amountInCents: 120000, dueDay: 8 }
    expect(calculateCommittedAmount([base, rent], '2026-09-01', '2026-09-30')).toBe(131990)
    expect(calculateCommittedAmount([{ ...base, isActive: false }, rent], '2026-09-01', '2026-09-30')).toBe(120000)
  })

  it('não disponibiliza uma ocorrência já vinculada a uma transação', () => {
    const transaction: FinanceTransaction = { id: 'paid', type: 'expense', amountCents: 11990, description: 'Internet', category: 'Assinaturas', accountId: 'account', date: '2026-09-10', recurringExpenseId: base.id, recurringOccurrenceDate: '2026-09-10', plannedAmountCents: base.amountInCents, createdAt: '2026-09-10T12:00:00.000Z' }
    expect(getUnrecordedOccurrencesBetween(base, '2026-09-01', '2026-09-30', [transaction])).toEqual([])
    expect(calculateCommittedAmount([base], '2026-09-01', '2026-09-30', [transaction])).toBe(0)
  })

  it('não trata o planejado como despesa realizada', () => {
    const account: Account = { id: 'account', name: 'Conta', type: 'checking', initialBalanceCents: 500000, color: '#2F80ED', archived: false, createdAt: '2026-01-01' }
    expect(accountBalance(account, [])).toBe(500000)
    const realized: FinanceTransaction = { id: 'realized', type: 'expense', amountCents: 10500, description: base.name, category: base.category, accountId: account.id, date: '2026-09-10', recurringExpenseId: base.id, recurringOccurrenceDate: '2026-09-10', plannedAmountCents: base.amountInCents, createdAt: '2026-09-10T12:00:00.000Z' }
    expect(accountBalance(account, [realized])).toBe(489500)
    expect(realized.plannedAmountCents).toBe(11990)
    expect(realized.amountCents).toBe(10500)
  })
})
