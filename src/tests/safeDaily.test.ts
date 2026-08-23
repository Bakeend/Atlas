import { describe, it, expect, beforeEach } from 'vitest'
import { money, today, uid } from '../domain'
import { useFinanceStore } from '../store'
import { calculateSafeDailySpend, simulateDailySpend, classifyTransaction } from '../ai/services/financialEngine'
import { executeTool } from '../ai/tools/registry'
import { seededData } from '../testing/seedFixture'

function reset() {
  const s = seededData()
  useFinanceStore.setState({ ...s, ready: true } as any)
}

function setNextIncome(daysFromNow: number, amount = 450000) {
  const t = today()
  const d = new Date(`${t}T12:00:00`)
  d.setDate(d.getDate() + daysFromNow)
  const iso = d.toISOString().slice(0,10)
  const rec = { id: uid(), name: 'Salário', amountInCents: amount, category: 'Receita', accountId: 'account-bank', frequency: 'monthly' as const, dueDay: d.getDate(), startDate: `${t.slice(0,7)}-01`, isActive: true, createdAt: t, updatedAt: t }
  // ensure startDate allows occurrence on iso
  // For monthly, dueDay is the day, startDate month start, so occurrence will be iso's month dueDay
  // To guarantee iso is next occurrence, set startDate to today and dueDay to target day, but if month changes, we need to handle
  // Simpler: set frequency weekly so next occurrence is exactly iso if we set startDate = iso
  // Use weekly for precise control: if we set weekly, startDate = t, then occurrences are every 7 days, not exact
  // Easier: just push a recurringIncome and mock calculateSafeDailySpend to use that date directly by setting dueDay and startDate appropriately
  // For test, we will manually set recurringIncomes and also ensure getUnrecordedOccurrences finds iso
  // Trick: set startDate = iso, frequency monthly, dueDay = day of iso, isActive true -> getNextOccurrence from today will be iso if iso >= today
  rec.startDate = iso
  rec.dueDay = d.getDate()
  const state = useFinanceStore.getState() as any
  useFinanceStore.setState({ recurringIncomes: [rec] } as any)
  return iso
}

describe('Quanto posso gastar hoje - motor', () => {
  beforeEach(reset)

  it('dinheiro livre positivo calcula safeDaily', () => {
    const iso = setNextIncome(15, 450000)
    // total balance seeded is 4500+80 - committed? seeded total approx 450000+8000 + incomes etc = 458k? Let's compute free
    const r = calculateSafeDailySpend()
    expect(r.hasNextIncome).toBe(true)
    expect(r.daysUntilNextIncome).toBe(15)
    expect(r.freeMoneyInCents).toBeGreaterThan(0)
    expect(r.safeDailySpendInCents).toBeGreaterThan(0)
    expect(r.safeDailySpendInCents).toBe(Math.floor(r.distributableInCents / 15))
  })

  it('dinheiro livre zero', () => {
    // esvazia contas
    const s = useFinanceStore.getState() as any
    useFinanceStore.setState({ accounts: s.accounts.map((a:any)=> ({ ...a, initialBalanceCents: 0 })), transactions: [] } as any)
    setNextIncome(10, 10000)
    const r = calculateSafeDailySpend()
    // total 0, committed maybe 0, free 0
    expect(r.freeMoneyInCents).toBe(0)
    expect(r.safeDailySpendInCents).toBe(0)
  })

  it('déficit (free negativo)', () => {
    const s = useFinanceStore.getState() as any
    // cria gasto recorrente gigante para gerar déficit
    const far = setNextIncome(5, 10000)
    // add huge recurring expense
    const exp = { id: uid(), name: 'Conta gigante', amountInCents: 999999, category: 'Moradia', accountId: 'account-bank', frequency: 'monthly' as const, dueDay: new Date(`${today()}T12:00:00`).getDate(), startDate: today(), isVariable: false, isActive: true, reminderEnabled: false, createdAt: today(), updatedAt: today() }
    useFinanceStore.setState({ recurringExpenses: [...s.recurringExpenses, exp] } as any)
    const r = calculateSafeDailySpend()
    expect(r.freeMoneyInCents).toBeLessThan(0)
    expect(r.status).toBe('negative_free')
  })

  it('gasto parcial durante o dia', () => {
    const iso = setNextIncome(10)
    const before = calculateSafeDailySpend()
    const daily = before.safeDailySpendInCents!
    // gasta 20 reais hoje (2000) que é discretionary
    const tx = { id: uid(), type: 'expense' as const, amountCents: 2000, description: 'Lanche', category: 'Lazer', accountId: 'account-bank', date: today(), createdAt: today() }
    useFinanceStore.getState().addTransaction(tx)
    const after = calculateSafeDailySpend()
    expect(after.spentTodayInCents).toBe(2000)
    expect(after.remainingTodayInCents).toBe(daily - 2000)
  })

  it('gasto acima do recomendado', () => {
    setNextIncome(10)
    const base = calculateSafeDailySpend()
    const daily = base.safeDailySpendInCents!
    const tx = { id: uid(), type: 'expense' as const, amountCents: daily + 3500, description: 'Restaurante', category: 'Lazer', accountId: 'account-bank', date: today(), createdAt: today() }
    useFinanceStore.getState().addTransaction(tx)
    const r = calculateSafeDailySpend()
    expect(r.status).toBe('over')
    expect(r.remainingTodayInCents).toBeLessThan(0)
  })

  it('pagamento amanhã (1 dia)', () => {
    setNextIncome(1)
    const r = calculateSafeDailySpend()
    expect(r.daysUntilNextIncome).toBe(1)
    // safeDaily should be distributable /1
    expect(r.safeDailySpendInCents).toBe(r.distributableInCents)
  })

  it('salário amanhã com gasto hoje', () => {
    setNextIncome(1, 500000)
    const base = calculateSafeDailySpend()
    const r = calculateSafeDailySpend()
    expect(r.daysUntilNextIncome).toBe(1)
    // simulate gastar
    const sim = simulateDailySpend(20000)
    expect(sim.daysAfter).toBe(0)
    expect(sim.newDailyInCents).toBe(0)
  })

  it('salário em 30 dias', () => {
    setNextIncome(30)
    const r = calculateSafeDailySpend()
    expect(r.daysUntilNextIncome).toBe(30)
    expect(r.safeDailySpendInCents).toBe(Math.floor(r.distributableInCents / 30))
  })

  it('conta já reservada não consome limite diário', () => {
    setNextIncome(10)
    // cria conta reservada vencendo hoje para garantir que está no committed
    const day = Number(today().slice(8,10))
    const recToday: any = { id: uid(), name: 'Conta Hoje', amountInCents: 50000, category: 'Moradia', accountId: 'account-bank', frequency: 'monthly' as const, dueDay: day, startDate: today(), isVariable: false, isActive: true, reminderEnabled: false, createdAt: today(), updatedAt: today() }
    useFinanceStore.getState().saveRecurringExpense(recToday)
    const before = calculateSafeDailySpend()
    // paga essa conta hoje
    const tx = { id: uid(), type: 'expense' as const, amountCents: recToday.amountInCents, description: recToday.name, category: recToday.category, accountId: recToday.accountId, date: today(), recurringExpenseId: recToday.id, recurringOccurrenceDate: today(), createdAt: today() }
    useFinanceStore.getState().addTransaction(tx)
    const after = calculateSafeDailySpend()
    // spentToday should NOT include reserved, so should stay 0 (if no other spends)
    expect(classifyTransaction(tx)).toBe('reserved')
    expect(after.spentTodayInCents).toBe(before.spentTodayInCents)
    // freeMoney deve permanecer igual (total caiu mas committed também caiu)
    expect(after.freeMoneyInCents).toBe(before.freeMoneyInCents)
    expect(after.remainingTodayInCents).toBe(before.remainingTodayInCents)
  })

  it('gasto inesperado (discricionário) consome', () => {
    setNextIncome(10)
    const tx = { id: uid(), type: 'expense' as const, amountCents: 5000, description: 'Bar', category: 'Lazer', accountId: 'account-bank', date: today(), createdAt: today() }
    expect(classifyTransaction(tx)).toBe('discretionary')
    useFinanceStore.getState().addTransaction(tx)
    const r = calculateSafeDailySpend()
    expect(r.spentTodayInCents).toBe(5000)
  })

  it('margem de segurança 10% reduz distribuível', () => {
    setNextIncome(10)
    const base = calculateSafeDailySpend()
    const margin = base.safetyReserveInCents
    expect(margin).toBe(Math.round(base.freeMoneyInCents * 0.1))
    // muda para 20%
    useFinanceStore.getState().setSafetyMarginPercent(20)
    const r2 = calculateSafeDailySpend()
    expect(r2.safetyMarginPercent).toBe(20)
    expect(r2.safetyReserveInCents).toBe(Math.round(r2.freeMoneyInCents * 0.2))
    expect(r2.safeDailySpendInCents).toBeLessThan(base.safeDailySpendInCents!)
  })

  it('simulação sem persistência', async () => {
    reset()
    setNextIncome(15)
    const beforeTxCount = useFinanceStore.getState().transactions.length
    const beforeFree = calculateSafeDailySpend().freeMoneyInCents
    const sim = simulateDailySpend(30000) // 300
    expect(sim.freeAfterInCents).toBe(beforeFree - 30000)
    expect(sim.newDailyInCents).toBe(Math.floor((sim.freeAfterInCents - Math.round(sim.freeAfterInCents * 0.1)) / 14))
    // garante que não criou transação
    expect(useFinanceStore.getState().transactions.length).toBe(beforeTxCount)
    // via tool também não persiste
    const toolRes = await executeTool('simulateDailySpend', { amountInCents: 20000 })
    expect(toolRes.success).toBe(true)
    expect(useFinanceStore.getState().transactions.length).toBe(beforeTxCount)
  })

  it('ausência de próxima receita', () => {
    reset() // sem recurringIncomes
    const r = calculateSafeDailySpend()
    expect(r.hasNextIncome).toBe(false)
    expect(r.status).toBe('no_income')
    expect(r.safeDailySpendInCents).toBeNull()
    // tool também
  })

  it('tools getSafeDailySpend e simulate via registry', async () => {
    setNextIncome(12)
    const a = await executeTool('getSafeDailySpend', {})
    expect(a.success).toBe(true)
    expect((a.result as any).safeDaily).toBeDefined()
    const b = await executeTool('simulateDailySpend', { amountInCents: 10000 })
    expect(b.success).toBe(true)
    expect((b.result as any).simulation).toBe(true)
  })
})
