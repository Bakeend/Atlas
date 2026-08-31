import { describe, it, expect, beforeEach } from 'vitest'
import { sqlRepository } from './sqlRepository'
import { emptyData } from '../domain'

describe('sqlRepository (SQL local)', () => {
  beforeEach(async () => {
    // limpa estado de teste
    await sqlRepository.save(emptyData())
  })

  it('salva e carrega FinanceData via SQL', async () => {
    const data = emptyData()
    data.accounts = [
      { id: 'acc-1', name: 'Conta Teste', type: 'checking', initialBalanceCents: 10000, color: '#2F80ED', archived: false, createdAt: '2026-01-01' },
    ]
    data.transactions = [
      { id: 'tx-1', type: 'expense', amountCents: 5000, description: 'Teste', category: 'Outros', accountId: 'acc-1', date: '2026-01-02', createdAt: '2026-01-02' },
    ]
    await sqlRepository.save(data)
    const loaded = await sqlRepository.load()
    expect(loaded.accounts).toHaveLength(1)
    expect(loaded.accounts[0].name).toBe('Conta Teste')
    expect(loaded.transactions).toHaveLength(1)
    expect(loaded.transactions[0].description).toBe('Teste')
  })

  it('persiste cartões de crédito via SQL', async () => {
    const data = emptyData()
    data.creditCards = [
      { id: 'card-1', name: 'Nubank', bank: 'Nubank', limitCents: 500000, closingDay: 10, dueDay: 20, color: '#2F80ED', paymentAccountId: 'acc-1', archived: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' } as any,
    ] as any
    data.creditCardPurchases = [
      { id: 'p1', cardId: 'card-1', description: 'Teste', category: 'Outros', totalAmountCents: 120000, installments: 3, purchaseDate: '2026-01-05', createdAt: '2026-01-05', status: 'active' } as any,
    ] as any
    await sqlRepository.save(data as any)
    const loaded = await sqlRepository.load()
    expect(loaded.creditCards).toHaveLength(1)
    expect(loaded.creditCardPurchases).toHaveLength(1)
    expect(loaded.creditCards[0].bank).toBe('Nubank')
  })

  it('informa engine de armazenamento', async () => {
    const info = await sqlRepository.getStorageInfo()
    expect(info.engine).toMatch(/sql|memory|localStorage/)
  })

  it('mantém compatibilidade: dados vazios retornam emptyData', async () => {
    await sqlRepository.save(emptyData())
    const loaded = await sqlRepository.load()
    expect(loaded.accounts).toEqual([])
    expect(loaded.creditCards).toEqual([])
  })
})
