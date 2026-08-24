import { z } from 'zod'
import { money, uid } from '../../domain'
import { useFinanceStore, waitForPersist } from '../../store'
import { preparePaymentAllocationPlan } from '../services/financialEngine'

const prepareSchema = z.object({
  receivedAmountInCents: z.number().int().min(1),
  sourceTransactionId: z.string().optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  safetyMarginPercent: z.number().int().min(0).max(50).optional(),
})

const getSchema = z.object({ id: z.string().optional() })
const applySchema = z.object({ id: z.string().min(1) })
const cancelSchema = z.object({ id: z.string().min(1) })
const updateItemSchema = z.object({ planId: z.string().min(1), itemId: z.string().min(1), amountInCents: z.number().int().min(0) })

export const paymentAllocationTools = [
  {
    type: 'function' as const,
    function: {
      name: 'preparePaymentAllocationPlan',
      description: 'Prepara plano de distribuição para um recebimento (ex: salário). Analisa saldo, próximo recebimento, contas recorrentes, orçamentos, metas e margem. Retorna preview obrigatório antes de aplicar. Use receivedAmountInCents (ex 450000 = R$4.500).',
      parameters: {
        type: 'object',
        properties: {
          receivedAmountInCents: { type: 'number', description: 'valor recebido em centavos' },
          sourceTransactionId: { type: 'string', description: 'ID da transação de receita que originou' },
          periodEnd: { type: 'string', description: 'YYYY-MM-DD fim do período (padrão próximo recebimento)' },
          safetyMarginPercent: { type: 'number', description: '0-50, padrão 10' },
        },
        required: ['receivedAmountInCents'],
      },
    },
    _zod: prepareSchema,
    _execute: async (args: any) => {
      const parsed = prepareSchema.parse(args)
      // valida se sourceTransaction existe e é income se fornecido
      if (parsed.sourceTransactionId) {
        const s = useFinanceStore.getState() as any
        const tx = s.transactions.find((t: any) => t.id === parsed.sourceTransactionId)
        if (!tx) throw new Error('Transação de origem não encontrada')
        if (tx.type !== 'income') throw new Error('Transação de origem deve ser receita')
      }
      const plan = preparePaymentAllocationPlan({
        receivedAmountInCents: parsed.receivedAmountInCents,
        sourceTransactionId: parsed.sourceTransactionId,
        periodEnd: parsed.periodEnd,
        safetyMarginPercent: parsed.safetyMarginPercent,
      })
      useFinanceStore.getState().savePaymentAllocationPlan(plan)
      const totalAllocated = plan.items.filter(i => i.type !== 'free').reduce((sum, it) => sum + it.amountInCents, 0)
      const deficit = totalAllocated > plan.receivedAmountInCents ? totalAllocated - plan.receivedAmountInCents : 0
      return {
        success: true,
        plan: {
          id: plan.id,
          receivedAmount: money(plan.receivedAmountInCents),
          receivedAmountInCents: plan.receivedAmountInCents,
          period: `${plan.periodStart} até ${plan.periodEnd}`,
          items: plan.items.map(it => ({
            id: it.id,
            label: it.label,
            type: it.type,
            amount: money(it.amountInCents),
            amountInCents: it.amountInCents,
            isConsumed: it.isConsumed,
          })),
          freeAmount: money(plan.freeAmountInCents),
          freeAmountInCents: plan.freeAmountInCents,
          totalAllocated: money(totalAllocated),
          deficit: deficit ? money(deficit) : null,
          deficitInCents: deficit,
          status: plan.status,
          preview: 'Preview obrigatório — edite se necessário e confirme com [Aplicar organização]',
        },
      }
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getPaymentAllocationPlan',
      description: 'Lista ou busca plano de pagamento por ID. Sem ID, lista os últimos.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: [] },
    },
    _zod: getSchema,
    _execute: async (args: any) => {
      const parsed = getSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const list = s.paymentAllocationPlans ?? []
      if (parsed.id) {
        const plan = list.find((p: any) => p.id === parsed.id)
        if (!plan) throw new Error('Plano não encontrado')
        return {
          plan: {
            id: plan.id,
            receivedAmount: money(plan.receivedAmountInCents),
            period: `${plan.periodStart} até ${plan.periodEnd}`,
            status: plan.status,
            items: plan.items.map((it: any) => ({ label: it.label, type: it.type, amount: money(it.amountInCents), isConsumed: it.isConsumed })),
            freeAmount: money(plan.freeAmountInCents),
          },
        }
      }
      return {
        plans: list.slice(-10).reverse().map((p: any) => ({
          id: p.id,
          receivedAmount: money(p.receivedAmountInCents),
          period: `${p.periodStart} até ${p.periodEnd}`,
          status: p.status,
          freeAmount: money(p.freeAmountInCents),
          createdAt: p.createdAt,
        })),
      }
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'applyPaymentAllocationPlan',
      description: 'Aplica plano de pagamento. Cria reservas virtuais que reduzem Dinheiro Livre. Exige confirmação explícita.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: applySchema,
    _execute: async (args: any) => {
      const parsed = applySchema.parse(args)
      const s = useFinanceStore.getState() as any
      const plan = (s.paymentAllocationPlans ?? []).find((p: any) => p.id === parsed.id)
      if (!plan) throw new Error('Plano não encontrado')
      if (plan.status === 'applied') return { success: true, alreadyApplied: true, id: plan.id }
      if (plan.status === 'cancelled') throw new Error('Plano cancelado não pode ser aplicado')
      useFinanceStore.getState().applyPaymentAllocationPlan(parsed.id)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. O plano não foi aplicado.') }
      return { success: true, appliedId: parsed.id, message: `Plano aplicado. ${plan.items.filter((i: any) => i.type !== 'free').length} reservas criadas. Livre: ${money(plan.freeAmountInCents)}` }
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cancelPaymentAllocationPlan',
      description: 'Cancela plano draft.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: cancelSchema,
    _execute: async (args: any) => {
      const parsed = cancelSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const plan = (s.paymentAllocationPlans ?? []).find((p: any) => p.id === parsed.id)
      if (!plan) throw new Error('Plano não encontrado')
      if (plan.status === 'applied') throw new Error('Plano já aplicado não pode ser cancelado, apenas visualizado')
      useFinanceStore.getState().cancelPaymentAllocationPlan(parsed.id)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. O cancelamento não foi concluído.') }
      return { success: true, cancelledId: parsed.id }
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'updatePaymentAllocationItem',
      description: 'Edita valor de um item do plano antes de aplicar. Atualiza livre automaticamente.',
      parameters: { type: 'object', properties: { planId: { type: 'string' }, itemId: { type: 'string' }, amountInCents: { type: 'number' } }, required: ['planId', 'itemId', 'amountInCents'] },
    },
    _zod: updateItemSchema,
    _execute: async (args: any) => {
      const parsed = updateItemSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const plan = (s.paymentAllocationPlans ?? []).find((p: any) => p.id === parsed.planId)
      if (!plan) throw new Error('Plano não encontrado')
      if (plan.status !== 'draft') throw new Error('Só é possível editar plano em rascunho (draft)')
      useFinanceStore.getState().updatePaymentAllocationItem(parsed.planId, parsed.itemId, parsed.amountInCents)
      const updated = (useFinanceStore.getState() as any).paymentAllocationPlans.find((p: any) => p.id === parsed.planId)
      return {
        success: true,
        plan: {
          id: updated.id,
          items: updated.items.map((it: any) => ({ label: it.label, type: it.type, amount: money(it.amountInCents) })),
          freeAmount: money(updated.freeAmountInCents),
          freeAmountInCents: updated.freeAmountInCents,
        },
      }
    },
  },
]
