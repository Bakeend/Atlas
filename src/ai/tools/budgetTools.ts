import { money, uid } from '../../domain'
import { useFinanceStore } from '../../store'
import { createBudgetSchema, deleteBudgetSchema, updateBudgetSchema } from '../schemas/toolSchemas'

export const budgetTools = [
  {
    type: 'function' as const,
    function: {
      name: 'createBudget',
      description: 'Cria orçamento mensal por categoria. Exige mês YYYY-MM e limite em centavos.',
      parameters: { type: 'object', properties: { category: { type: 'string' }, month: { type: 'string', description: 'YYYY-MM' }, limitCents: { type: 'number' } }, required: ['category','month','limitCents'] },
    },
    _zod: createBudgetSchema,
    _execute: async (args:any) => {
      const parsed = createBudgetSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const exists = s.budgets.find((b:any)=> b.category===parsed.category && b.month===parsed.month)
      if (exists) throw new Error(`Orçamento para ${parsed.category} em ${parsed.month} já existe. Use updateBudget.`)
      const budget = { id: uid(), category: parsed.category, month: parsed.month, limitCents: parsed.limitCents }
      useFinanceStore.getState().saveBudget(budget)
      return { success: true, budget: { id: budget.id, category: budget.category, limit: money(budget.limitCents) } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateBudget',
      description: 'Atualiza orçamento existente.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, category: { type: 'string' }, month: { type: 'string' }, limitCents: { type: 'number' } }, required: ['id'] },
    },
    _zod: updateBudgetSchema,
    _execute: async (args:any) => {
      const parsed = updateBudgetSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.budgets.find((b:any)=> b.id===parsed.id)
      if (!existing) throw new Error('Orçamento não encontrado')
      const updated = { ...existing, category: parsed.category ?? existing.category, month: parsed.month ?? existing.month, limitCents: parsed.limitCents ?? existing.limitCents }
      useFinanceStore.getState().saveBudget(updated)
      return { success: true, budget: { id: updated.id, category: updated.category, limit: money(updated.limitCents) } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteBudget',
      description: 'EXCLUSÃO: remove orçamento. Requer confirmação.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: deleteBudgetSchema,
    _execute: async (args:any) => {
      const parsed = deleteBudgetSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.budgets.find((b:any)=> b.id===parsed.id)
      if (!existing) throw new Error('Orçamento não encontrado')
      // store has no deleteBudget, implement via filtering
      const next = s.budgets.filter((b:any)=> b.id!==parsed.id)
      useFinanceStore.setState({ budgets: next } as any)
      try { const { indexedDbRepository } = await import('../../data/repository'); const state = useFinanceStore.getState() as any; await indexedDbRepository.save({ ...state, budgets: next } as any) } catch {}
      return { success: true, deletedId: parsed.id }
    }
  },
]
