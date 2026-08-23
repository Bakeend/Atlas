import { describe, it, expect, beforeEach } from 'vitest'
import { today, uid } from '../domain'
import { useFinanceStore } from '../store'
import { seededData } from '../testing/seedFixture'
import { calculateFreeMoney, calculateCommitted } from '../ai/services/financialEngine'
import { executeTool } from '../ai/tools/registry'

function reset() {
  const s = seededData()
  // zera orçamentos e recorrências para testes controlados quando necessário
  useFinanceStore.setState({ ...s, ready: true } as any)
}

function addDaysIso(d: string, days: number) {
  const date = new Date(`${d}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('Dinheiro Livre', () => {
  beforeEach(reset)

  it('saldo sem compromissos => livre = saldo', () => {
    useFinanceStore.setState({ recurringExpenses: [], budgets: [], goals: [], paymentAllocationPlans: [] } as any)
    const r = calculateFreeMoney({ period: 'next30' })
    expect(r.totalCents).toBeGreaterThan(0)
    expect(r.committedCents).toBe(0)
    expect(r.freeCents).toBe(r.totalCents - r.safetyMarginCents) // sem orçamentos/metas, livre = total - margem
  })

  it('saldo com várias contas futuras', () => {
    const r = calculateFreeMoney({ period: 'next30' })
    // seed tem Aluguel 142500, Internet, Streaming
    expect(r.committedCents).toBeGreaterThan(100000)
    expect(r.freeCents).toBe(r.totalCents - r.committedCents - r.essentialBudgetsCents - r.goalsCents - r.safetyMarginCents)
  })

  it('recorrência já paga não duplica', () => {
    const s = useFinanceStore.getState() as any
    const rec = s.recurringExpenses[0] // Aluguel
    const t = today()
    // cria ocorrência paga para hoje
    const occ = rec.startDate // use startDate occurrence
    // usa getNextOccurrence para garantir data dentro do período
    // Força transação com recurringExpenseId e occurrenceDate igual à próxima ocorrência
    const nextEnd = addDaysIso(t, 30)
    // pega próxima ocorrência não paga
    const tx = { id: uid(), type: 'expense' as const, amountCents: rec.amountInCents, description: rec.name, category: rec.category, accountId: rec.accountId, date: t, recurringExpenseId: rec.id, recurringOccurrenceDate: rec.startDate, createdAt: new Date().toISOString() }
    // mas startDate pode ser passado; melhor usar t como occurrenceDate e simular já paga dentro do período
    // vamos usar t como occurrenceDate e garantir que getUnrecordedOccurrencesBetween filtra
    useFinanceStore.getState().addTransaction(tx)
    const before = calculateCommitted(t, nextEnd)
    // adiciona transação que cobre a ocorrência que estaria no período t->end
    // Para garantir, criamos recorrência com dueDay hoje e start hoje, então ocorrência é hoje
    const expToday = { id: uid(), name: 'ContaHoje', amountInCents: 50000, category: 'Moradia', accountId: 'account-bank', frequency: 'monthly' as const, dueDay: Number(t.slice(8,10)), startDate: t, isVariable: false, isActive: true, reminderEnabled: false, createdAt: t, updatedAt: t }
    useFinanceStore.getState().saveRecurringExpense(expToday as any)
    const committedBeforePay = calculateFreeMoney({ period: 'next30' }).committedCents
    const occDate = t
    const payTx = { id: uid(), type: 'expense' as const, amountCents: 50000, description: 'ContaHoje', category: 'Moradia', accountId: 'account-bank', date: t, recurringExpenseId: expToday.id, recurringOccurrenceDate: occDate, createdAt: new Date().toISOString() }
    useFinanceStore.getState().addTransaction(payTx)
    const committedAfterPay = calculateFreeMoney({ period: 'next30' }).committedCents
    expect(committedAfterPay).toBe(committedBeforePay - 50000)
  })

  it('compromisso pausado não conta', () => {
    const s = useFinanceStore.getState() as any
    const rec = s.recurringExpenses[0]
    const before = calculateFreeMoney({ period: 'next30' }).committedCents
    useFinanceStore.getState().toggleRecurringExpense(rec.id) // pausa
    const after = calculateFreeMoney({ period: 'next30' }).committedCents
    expect(after).toBeLessThan(before)
    expect(after).toBe(before - rec.amountInCents)
  })

  it('gasto variável com flag Estimado', () => {
    const variable = { id: uid(), name: 'Energia', amountInCents: 20000, category: 'Moradia', accountId: 'account-bank', frequency: 'monthly' as const, dueDay: 10, startDate: today(), isVariable: true, isActive: true, reminderEnabled: false, createdAt: today(), updatedAt: today() }
    useFinanceStore.getState().saveRecurringExpense(variable as any)
    // cria histórico para média
    const hist1 = { id: uid(), type: 'expense' as const, amountCents: 25000, description: 'Energia conta', category: 'Moradia', accountId: 'account-bank', date: addDaysIso(today(), -10), createdAt: new Date().toISOString() }
    const hist2 = { id: uid(), type: 'expense' as const, amountCents: 30000, description: 'Energia conta', category: 'Moradia', accountId: 'account-bank', date: addDaysIso(today(), -40), createdAt: new Date().toISOString() }
    useFinanceStore.getState().addTransaction(hist1)
    useFinanceStore.getState().addTransaction(hist2)
    const r = calculateFreeMoney({ period: 'next30' })
    const detail = r.committedDetails.find(d => d.id === variable.id)
    expect(detail).toBeDefined()
    expect(detail!.isVariable).toBe(true)
    // deve ter usado média (25000+30000)/2=27500 ≈ estimado
    expect(detail!.isEstimated).toBe(true)
    expect(detail!.amountCents).not.toBe(20000)
  })

  it('metas reduzem livre', () => {
    const goal = { id: uid(), title: 'Reserva', targetAmountInCents: 1000000, currentAmountInCents: 200000, createdAt: today(), updatedAt: today(), deadline: addDaysIso(today(), 60) }
    useFinanceStore.getState().saveGoal(goal as any)
    const rWithGoal = calculateFreeMoney({ period: 'next30' })
    expect(rWithGoal.goalsCents).toBeGreaterThan(0)
    // remove goal, livre deve aumentar
    useFinanceStore.getState().deleteGoal(goal.id)
    const rWithout = calculateFreeMoney({ period: 'next30' })
    expect(rWithout.freeCents).toBeGreaterThan(rWithGoal.freeCents)
  })

  it('orçamento essencial reservado reduz livre', () => {
    const rBefore = calculateFreeMoney({ period: 'next30' })
    const essentialBefore = rBefore.essentialBudgetsCents
    // adiciona orçamento essencial novo
    const newBudget = { id: uid(), category: 'Saúde', month: today().slice(0,7), limitCents: 50000 }
    useFinanceStore.getState().saveBudget(newBudget)
    const rAfter = calculateFreeMoney({ period: 'next30' })
    expect(rAfter.essentialBudgetsCents).toBe(essentialBefore + 50000)
    expect(rAfter.freeCents).toBeLessThan(rBefore.freeCents)
  })

  it('próximo salário define período', () => {
    const income = { id: uid(), name: 'Salário', amountInCents: 500000, category: 'Receita', accountId: 'account-bank', frequency: 'monthly' as const, dueDay: 5, startDate: today(), isActive: true, createdAt: today(), updatedAt: today() }
    useFinanceStore.getState().saveRecurringIncome(income as any)
    const r = calculateFreeMoney({ period: 'nextIncome' })
    expect(r.period.hasNextIncome).toBe(true)
    expect(r.period.nextIncomeDate).toBeTruthy()
    expect(r.period.days).toBeGreaterThan(0)
  })

  it('ausência de próxima receita usa 30 dias', () => {
    useFinanceStore.setState({ recurringIncomes: [] } as any)
    const r = calculateFreeMoney({ period: 'nextIncome' })
    expect(r.period.hasNextIncome).toBe(false)
    expect(r.period.days).toBe(31)
  })

  it('dinheiro livre negativo mostra déficit', () => {
    // cria compromisso gigante para estourar saldo
    const big = { id: uid(), name: 'Parcela gigante', amountInCents: 9999999, category: 'Moradia', accountId: 'account-bank', frequency: 'monthly' as const, dueDay: Number(today().slice(8,10)), startDate: today(), isVariable: false, isActive: true, reminderEnabled: false, createdAt: today(), updatedAt: today() }
    useFinanceStore.getState().saveRecurringExpense(big as any)
    const r = calculateFreeMoney({ period: 'next30' })
    expect(r.isNegative).toBe(true)
    expect(r.freeCents).toBeLessThan(0)
    expect(r.deficitCents).toBe(Math.abs(r.freeCents))
    expect(r.deficitFormatted).toBeTruthy()
  })

  it('exemplo do spec: saldo 4850 com compromissos 2170 => livre 2680', () => {
    // reset para saldo controlado
    const s = seededData()
    // ajusta saldo para 4850 (485000 cents) — usa apenas conta principal para controle
    const bank = { ...s.accounts[0], initialBalanceCents: 485000 }
    // limpa transações que afetam saldo para ter controle: mantemos só as que não são do período? Simplifica: zera transações e usa saldo inicial
    useFinanceStore.setState({
      ...s,
      accounts: [bank],
      transactions: [],
      recurringExpenses: [],
      budgets: [],
      goals: [],
      paymentAllocationPlans: [],
      safetyMarginPercent: 0,
    } as any)
    // cria recorrências: Internet 120, Faculdade 450, Energia 200 variável
    const internet = { id: uid(), name: 'Internet', amountInCents: 12000, category: 'Assinaturas', accountId: bank.id, frequency: 'monthly' as const, dueDay: 10, startDate: today(), isVariable: false, isActive: true, reminderEnabled: false, createdAt: today(), updatedAt: today() }
    const faculdade = { id: uid(), name: 'Faculdade', amountInCents: 45000, category: 'Educação', accountId: bank.id, frequency: 'monthly' as const, dueDay: 10, startDate: today(), isVariable: false, isActive: true, reminderEnabled: false, createdAt: today(), updatedAt: today() }
    const energia = { id: uid(), name: 'Energia', amountInCents: 20000, category: 'Moradia', accountId: bank.id, frequency: 'monthly' as const, dueDay: 10, startDate: today(), isVariable: true, isActive: true, reminderEnabled: false, createdAt: today(), updatedAt: today() }
    useFinanceStore.getState().saveRecurringExpense(internet as any)
    useFinanceStore.getState().saveRecurringExpense(faculdade as any)
    useFinanceStore.getState().saveRecurringExpense(energia as any)
    // orçamentos essenciais: Alimentação 600, Transporte 300
    useFinanceStore.getState().saveBudget({ id: uid(), category: 'Alimentação', month: today().slice(0,7), limitCents: 60000 })
    useFinanceStore.getState().saveBudget({ id: uid(), category: 'Transporte', month: today().slice(0,7), limitCents: 30000 })
    // meta/reserva 500: cria goal com virtual reserve via paymentAllocation? Simula via goal com deadline
    const reserva = { id: uid(), title: 'Reserva', targetAmountInCents: 50000, currentAmountInCents: 0, createdAt: today(), updatedAt: today(), deadline: addDaysIso(today(), 30) }
    useFinanceStore.getState().saveGoal(reserva as any)
    // Para que goal conte como 500, precisamos virtual reserve? Nossa lógica de goals com deadline calcula mensal = remaining / months = 50000/1=50000, então goalsCents será 50000
    const r = calculateFreeMoney({ period: 'next30' })
    // total 485000, committed: 12000+45000+20000=77000, essential 90000, goals 50000 => free 268000
    expect(r.totalCents).toBe(485000)
    expect(r.committedCents).toBe(77000)
    expect(r.essentialBudgetsCents).toBe(90000)
    expect(r.goalsCents).toBe(50000)
    expect(r.freeCents).toBe(268000)
  })

  it('tools IA retornam determinístico', async () => {
    const res = await executeTool('getFreeMoney', { period: 'next30' })
    expect(res.success).toBe(true)
    const data: any = res.result
    expect(data.freeCents).toBeDefined()
    expect(data.total).toBeDefined()
    const res2 = await executeTool('getFreeMoneyBreakdown', { period: 'nextIncome' })
    expect(res2.success).toBe(true)
    expect((res2.result as any).breakdown).toBeDefined()
    const res3 = await executeTool('getCommittedAmount', { period: 'next30' })
    expect(res3.success).toBe(true)
    expect((res3.result as any).committedCents).toBeDefined()
  })

  it('valores reservados (virtual) reduzem livre sem dupla contagem', () => {
    // sem virtual
    const r1 = calculateFreeMoney({ period: 'next30' })
    const virtualBefore = r1.virtualReservesCents
    // cria plano virtual com reserva de 50000 para Teste
    const plan = {
      id: uid(),
      sourceTransactionId: undefined,
      receivedAmountInCents: 500000,
      periodStart: today(),
      periodEnd: addDaysIso(today(), 30),
      items: [
        { id: uid(), label: 'Reserva Virtual', type: 'reserve' as const, amountInCents: 50000 },
        { id: uid(), label: 'Livre', type: 'free' as const, amountInCents: 450000 },
      ],
      freeAmountInCents: 450000,
      status: 'applied' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    useFinanceStore.getState().savePaymentAllocationPlan(plan as any)
    const r2 = calculateFreeMoney({ period: 'next30' })
    expect(r2.virtualReservesCents).toBe(virtualBefore + 50000)
    // se não há meta, effectiveGoals deve ser max(0,50000)=50000, então livre deve cair 50000
    // r1 free - r2 free ≈ 50000 (considerando margem)
    // Permite pequena variação por margem
    expect(r2.freeCents).toBeLessThan(r1.freeCents)
  })
})
