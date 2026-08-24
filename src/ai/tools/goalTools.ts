import { money, uid } from '../../domain'
import { useFinanceStore, waitForPersist } from '../../store'
import { createGoalSchema, deleteGoalSchema, updateGoalSchema } from '../schemas/toolSchemas'

export const goalTools = [
  {
    type: 'function' as const,
    function: {
      name: 'createGoal',
      description: 'Cria meta financeira (ex: guardar R$ 500 por mês, reserva etc).',
      parameters: { type: 'object', properties: { title: { type: 'string' }, targetAmountInCents: { type: 'number' }, currentAmountInCents: { type: 'number' }, category: { type: 'string' }, accountId: { type: 'string' }, deadline: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['title','targetAmountInCents'] },
    },
    _zod: createGoalSchema,
    _execute: async (args:any) => {
      const parsed = createGoalSchema.parse(args)
      const now = new Date().toISOString()
      const goal = { id: uid(), title: parsed.title.trim(), targetAmountInCents: parsed.targetAmountInCents, currentAmountInCents: parsed.currentAmountInCents ?? 0, category: parsed.category, accountId: parsed.accountId, deadline: parsed.deadline, createdAt: now, updatedAt: now }
      useFinanceStore.getState().saveGoal(goal)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. A meta não foi criada.') }
      return { success: true, goal: { id: goal.id, title: goal.title, target: money(goal.targetAmountInCents) } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateGoal',
      description: 'Atualiza meta por ID.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, targetAmountInCents: { type: 'number' }, currentAmountInCents: { type: 'number' }, category: { type: 'string' }, accountId: { type: 'string' }, deadline: { type: 'string' } }, required: ['id'] },
    },
    _zod: updateGoalSchema,
    _execute: async (args:any) => {
      const parsed = updateGoalSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = (s.goals??[]).find((g:any)=> g.id===parsed.id)
      if (!existing) throw new Error('Meta não encontrada')
      const updated = { ...existing, ...parsed, updatedAt: new Date().toISOString() }
      useFinanceStore.getState().saveGoal(updated)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. A alteração não foi concluída.') }
      return { success: true, goal: { id: updated.id, title: updated.title } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteGoal',
      description: 'EXCLUSÃO: remove meta. Requer confirmação.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: deleteGoalSchema,
    _execute: async (args:any) => {
      const parsed = deleteGoalSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = (s.goals??[]).find((g:any)=> g.id===parsed.id)
      if (!existing) throw new Error('Meta não encontrada')
      useFinanceStore.getState().deleteGoal(parsed.id)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. A exclusão não foi concluída.') }
      return { success: true, deletedId: parsed.id }
    }
  },
]
