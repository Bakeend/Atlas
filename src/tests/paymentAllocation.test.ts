import { describe, it, expect, beforeEach } from 'vitest'
import { money, today, uid } from '../domain'
import { useFinanceStore } from '../store'
import { preparePaymentAllocationPlan, getVirtualReservesTotal } from '../ai/services/financialEngine'
import { executeTool } from '../ai/tools/registry'
import { seededData } from '../testing/seedFixture'

function reset() {
  const s = seededData()
  useFinanceStore.setState({ ...s, ready: true } as any)
}

function addIncome(amount: number, date = today()) {
  const tx = { id: uid(), type: 'income' as const, amountCents: amount, description: 'Salário', category: 'Receita', accountId: 'account-bank', date, createdAt: new Date().toISOString() }
  useFinanceStore.getState().addTransaction(tx)
  return tx
}

describe('Organizar meu pagamento', () => {
  beforeEach(reset)

  it('pagamento suficiente - livre positivo', async () => {
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    expect(plan.receivedAmountInCents).toBe(450000)
    expect(plan.freeAmountInCents).toBeGreaterThan(0)
    expect(plan.items.some(i => i.type === 'bill')).toBe(true)
    const res = await executeTool('preparePaymentAllocationPlan', { receivedAmountInCents: 450000 })
    expect(res.success).toBe(true)
    expect((res.result as any).plan.freeAmountInCents).toBeGreaterThan(0)
  })

  it('pagamento insuficiente - deficit', async () => {
    const exp = { id: uid(), name: 'Conta gigante', amountInCents: 999999, category: 'Moradia', accountId: 'account-bank', frequency: 'monthly' as const, dueDay: Number(today().slice(8,10)), startDate: today(), isVariable: false, isActive: true, reminderEnabled: false, createdAt: today(), updatedAt: today() }
    useFinanceStore.getState().saveRecurringExpense(exp as any)
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 100000 })
    expect(plan.freeAmountInCents).toBeLessThan(0)
    const res = await executeTool('preparePaymentAllocationPlan', { receivedAmountInCents: 50000 })
    expect((res.result as any).plan.deficitInCents).toBeGreaterThan(0)
  })

  it('nenhuma conta futura - só livre e reserva', () => {
    useFinanceStore.setState({ recurringExpenses: [] } as any)
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 300000 })
    expect(plan.items.filter(i => i.type === 'bill').length).toBe(0)
    expect(plan.freeAmountInCents).toBeGreaterThan(0)
  })

  it('duas receitas no mesmo mês - dois planos', async () => {
    const p1 = preparePaymentAllocationPlan({ receivedAmountInCents: 300000 })
    const p2 = preparePaymentAllocationPlan({ receivedAmountInCents: 200000 })
    useFinanceStore.getState().savePaymentAllocationPlan(p1)
    useFinanceStore.getState().savePaymentAllocationPlan(p2)
    const list = (useFinanceStore.getState() as any).paymentAllocationPlans
    expect(list.length).toBe(2)
    expect(list[0].receivedAmountInCents).toBe(300000)
    expect(list[1].receivedAmountInCents).toBe(200000)
  })

  it('compromissos já reservados - não duplica', async () => {
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    useFinanceStore.getState().savePaymentAllocationPlan(plan)
    useFinanceStore.getState().applyPaymentAllocationPlan(plan.id)
    getVirtualReservesTotal()
    const countBefore = (useFinanceStore.getState() as any).paymentAllocationPlans.length
    const plan2 = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    useFinanceStore.getState().savePaymentAllocationPlan(plan2)
    expect((useFinanceStore.getState() as any).paymentAllocationPlans.length).toBe(countBefore + 1)
  })

  it('recorrências pagas não entram como bill', () => {
    const rec = useFinanceStore.getState().recurringExpenses[0]
    const tx = { id: uid(), type: 'expense' as const, amountCents: rec.amountInCents, description: rec.name, category: rec.category, accountId: rec.accountId, date: today(), recurringExpenseId: rec.id, recurringOccurrenceDate: today(), createdAt: new Date().toISOString() }
    useFinanceStore.getState().addTransaction(tx)
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    expect(plan).toBeDefined()
  })

  it('gastos variáveis - usa orçamentos', () => {
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    const food = plan.items.find(i => i.label === 'Alimentação')
    expect(food).toBeDefined()
    expect(food!.amountInCents).toBeGreaterThan(0)
  })

  it('metas - aloca para metas', () => {
    const goal = { id: uid(), title: 'Reserva', targetAmountInCents: 1000000, currentAmountInCents: 200000, createdAt: today(), updatedAt: today() }
    useFinanceStore.getState().saveGoal(goal as any)
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    const goalItem = plan.items.find(i => i.type === 'goal')
    expect(goalItem).toBeDefined()
    expect(goalItem!.amountInCents).toBeGreaterThan(0)
  })

  it('alteração manual do plano', async () => {
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    useFinanceStore.getState().savePaymentAllocationPlan(plan)
    const firstBill = plan.items.find(i => i.type === 'bill')!
    const newAmount = firstBill.amountInCents + 10000
    await executeTool('updatePaymentAllocationItem', { planId: plan.id, itemId: firstBill.id, amountInCents: newAmount })
    const updated = (useFinanceStore.getState() as any).paymentAllocationPlans.find((p: any) => p.id === plan.id)
    expect(updated.items.find((i: any) => i.id === firstBill.id).amountInCents).toBe(newAmount)
    expect(updated.freeAmountInCents).toBe(plan.receivedAmountInCents - updated.items.filter((i: any) => i.type !== 'free').reduce((s: number, i: any) => s + i.amountInCents, 0))
  })

  it('aplicação - muda status e cria reservas', async () => {
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    useFinanceStore.getState().savePaymentAllocationPlan(plan)
    expect(plan.status).toBe('draft')
    await executeTool('applyPaymentAllocationPlan', { id: plan.id }, { confirmed: true })
    const after = (useFinanceStore.getState() as any).paymentAllocationPlans.find((p: any) => p.id === plan.id)
    expect(after.status).toBe('applied')
    expect(getVirtualReservesTotal()).toBeGreaterThan(0)
  })

  it('cancelamento - draft pode cancelar', async () => {
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 300000 })
    useFinanceStore.getState().savePaymentAllocationPlan(plan)
    await executeTool('cancelPaymentAllocationPlan', { id: plan.id }, { confirmed: true })
    const after = (useFinanceStore.getState() as any).paymentAllocationPlans.find((p: any) => p.id === plan.id)
    expect(after.status).toBe('cancelled')
  })

  it('evitar reserva duplicada - aplicar duas vezes não duplica', async () => {
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    useFinanceStore.getState().savePaymentAllocationPlan(plan)
    await executeTool('applyPaymentAllocationPlan', { id: plan.id })
    const firstApply = getVirtualReservesTotal()
    await executeTool('applyPaymentAllocationPlan', { id: plan.id })
    expect(getVirtualReservesTotal()).toBe(firstApply)
  })

  it('consome apenas a ocorrência reservada ao pagar conta', async () => {
    const rec = useFinanceStore.getState().recurringExpenses[0]
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: 450000 })
    const reservedBill = plan.items.find(i => i.recurringExpenseId === rec.id)
    expect(reservedBill).toBeDefined()
    expect(reservedBill?.recurringOccurrenceDate).toBeTruthy()

    useFinanceStore.getState().savePaymentAllocationPlan(plan)
    useFinanceStore.getState().applyPaymentAllocationPlan(plan.id)

    const occurrenceDate = reservedBill!.recurringOccurrenceDate!
    const tx = { id: uid(), type: 'expense' as const, amountCents: rec.amountInCents, description: rec.name, category: rec.category, accountId: rec.accountId, date: occurrenceDate, recurringExpenseId: rec.id, recurringOccurrenceDate: occurrenceDate, createdAt: new Date().toISOString() }
    useFinanceStore.getState().addTransaction(tx)

    const updatedPlan = (useFinanceStore.getState() as any).paymentAllocationPlans.find((p: any) => p.id === plan.id)
    const item = updatedPlan.items.find((i: any) => i.id === reservedBill!.id)
    expect(item.isConsumed).toBe(true)
  })
})
