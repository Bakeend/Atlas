import { describe, it, expect } from 'vitest'
import { closingDateForMonth, dueDateFromClosing, getNextClosingDate, getInstallmentAmount, getPurchaseInstallments, generateInvoicesForCard } from './creditCardService'
import type { CreditCard, CreditCardPurchase } from '../domain'

describe('creditCardService', () => {
  const card: CreditCard = {
    id: 'card-1',
    name: 'Nubank',
    bank: 'Nubank',
    limitCents: 500000,
    closingDay: 10,
    dueDay: 20,
    color: '#2F80ED',
    paymentAccountId: 'acc-1',
    archived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }

  it('calculates closing dates correctly', () => {
    expect(closingDateForMonth(2026, 8, 10)).toBe('2026-09-10') // month 8 = September
    expect(dueDateFromClosing('2026-09-10', 20)).toBe('2026-09-20')
    expect(dueDateFromClosing('2026-09-20', 10)).toBe('2026-10-10')
  })

  it('distributes installments correctly before closing', () => {
    const dates = getNextClosingDate(card, '2026-09-05')
    expect(dates).toBe('2026-09-10')
    const dates2 = getNextClosingDate(card, '2026-09-12')
    expect(dates2).toBe('2026-10-10')
  })

  it('splits 1200 in 6x correctly', () => {
    expect(getInstallmentAmount(120000, 6, 0)).toBe(20000)
    expect(getInstallmentAmount(120000, 6, 5)).toBe(20000)
  })

  it('handles remainder correctly', () => {
    // 1000 in 3x = 100000 cents -> 33333 + 33333 + 33334? nossa lógica dá 33334,33333,33333
    const a0 = getInstallmentAmount(100000, 3, 0)
    const a1 = getInstallmentAmount(100000, 3, 1)
    const a2 = getInstallmentAmount(100000, 3, 2)
    expect(a0 + a1 + a2).toBe(100000)
    expect(a0).toBe(33334)
  })

  it('generates installments for purchase', () => {
    const purchase: CreditCardPurchase = {
      id: 'p1',
      cardId: 'card-1',
      description: 'Teste',
      category: 'Outros',
      totalAmountCents: 120000,
      installments: 6,
      purchaseDate: '2026-09-05',
      createdAt: '2026-09-05',
      status: 'active',
    }
    const insts = getPurchaseInstallments(purchase, card)
    expect(insts.length).toBe(6)
    expect(insts[0].closingDate).toBe('2026-09-10')
    expect(insts[1].closingDate).toBe('2026-10-10')
    expect(insts[0].amountCents).toBe(20000)
  })

  it('generates invoices with correct totals', () => {
    const purchase: CreditCardPurchase = {
      id: 'p1',
      cardId: 'card-1',
      description: 'Teste',
      category: 'Alimentação',
      totalAmountCents: 120000,
      installments: 6,
      purchaseDate: '2026-09-05',
      createdAt: '2026-09-05',
      status: 'active',
    }
    const invoices = generateInvoicesForCard(card, [purchase], [], '2026-09-01', 0, 6)
    const sept = invoices.find(i => i.closingDate === '2026-09-10')
    const oct = invoices.find(i => i.closingDate === '2026-10-10')
    expect(sept?.totalCents).toBe(20000)
    expect(oct?.totalCents).toBe(20000)
  })

  it('handles purchase after closing', () => {
    const purchase: CreditCardPurchase = {
      id: 'p2',
      cardId: 'card-1',
      description: 'Depois',
      category: 'Transporte',
      totalAmountCents: 60000,
      installments: 3,
      purchaseDate: '2026-09-12',
      createdAt: '2026-09-12',
      status: 'active',
    }
    const insts = getPurchaseInstallments(purchase, card)
    expect(insts[0].closingDate).toBe('2026-10-10')
    expect(insts[1].closingDate).toBe('2026-11-10')
  })
})
