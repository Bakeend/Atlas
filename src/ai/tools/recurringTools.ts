import { money, today, uid } from '../../domain'
import { useFinanceStore } from '../../store'
import {
  createRecurringExpenseSchema, createRecurringIncomeSchema, deleteRecurringExpenseSchema, deleteRecurringIncomeSchema,
  pauseRecurringExpenseSchema, resumeRecurringExpenseSchema, updateRecurringExpenseSchema, updateRecurringIncomeSchema
} from '../schemas/toolSchemas'

export const recurringTools = [
  {
    type: 'function' as const,
    function: {
      name: 'createRecurringExpense',
      description: 'Cria gasto recorrente (conta fixa). Ex: aluguel, internet. frequência mensal/bimestral etc, startDate YYYY-MM-DD, dueDay 1-31 quando aplicável.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amountInCents: { type: 'number' },
          category: { type: 'string' },
          accountId: { type: 'string' },
          frequency: { type: 'string', enum: ['weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly'] },
          dueDay: { type: 'number' },
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          endDate: { type: 'string', description: 'YYYY-MM-DD' },
          description: { type: 'string' },
          isVariable: { type: 'boolean' },
          reminderEnabled: { type: 'boolean' },
          reminderDaysBefore: { type: 'number' },
        },
        required: ['name','amountInCents','category','accountId','frequency','startDate'],
      },
    },
    _zod: createRecurringExpenseSchema,
    _execute: async (args:any) => {
      const parsed = createRecurringExpenseSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const acc = s.accounts.find((a:any)=>a.id===parsed.accountId)
      if (!acc) throw new Error('Conta não encontrada')
      const now = new Date().toISOString()
      const rec = {
        id: uid(),
        name: parsed.name.trim(),
        amountInCents: parsed.amountInCents,
        category: parsed.category.trim(),
        accountId: parsed.accountId,
        frequency: parsed.frequency,
        dueDay: parsed.dueDay,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        description: parsed.description,
        isVariable: parsed.isVariable ?? false,
        isActive: true,
        reminderEnabled: parsed.reminderEnabled ?? false,
        reminderDaysBefore: parsed.reminderDaysBefore ?? 3,
        createdAt: now, updatedAt: now,
      }
      useFinanceStore.getState().saveRecurringExpense(rec)
      return { success: true, recurringExpense: { id: rec.id, name: rec.name, amount: money(rec.amountInCents), frequency: rec.frequency } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateRecurringExpense',
      description: 'Atualiza gasto recorrente existente. Pode alterar valor, vencimento, etc. Use para "meu aluguel será 1550 a partir de setembro".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          amountInCents: { type: 'number' },
          category: { type: 'string' },
          accountId: { type: 'string' },
          frequency: { type: 'string', enum: ['weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly'] },
          dueDay: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          description: { type: 'string' },
          isVariable: { type: 'boolean' },
          reminderEnabled: { type: 'boolean' },
          reminderDaysBefore: { type: 'number' },
          isActive: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    _zod: updateRecurringExpenseSchema,
    _execute: async (args:any) => {
      const parsed = updateRecurringExpenseSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.recurringExpenses.find((r:any)=> r.id===parsed.id)
      if (!existing) throw new Error('Gasto recorrente não encontrado')
      const updated = { ...existing, ...parsed, updatedAt: new Date().toISOString() }
      // if dueDay removed for weekly, delete
      if (['weekly','biweekly'].includes(updated.frequency)) delete updated.dueDay
      useFinanceStore.getState().saveRecurringExpense(updated)
      return { success: true, recurringExpense: { id: updated.id, name: updated.name, amount: money(updated.amountInCents) } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'pauseRecurringExpense',
      description: 'Pausa gasto recorrente (isActive=false).',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: pauseRecurringExpenseSchema,
    _execute: async (args:any) => {
      const parsed = pauseRecurringExpenseSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.recurringExpenses.find((r:any)=> r.id===parsed.id)
      if (!existing) throw new Error('Não encontrado')
      if (!existing.isActive) return { success: true, alreadyPaused: true }
      useFinanceStore.getState().saveRecurringExpense({ ...existing, isActive: false, updatedAt: new Date().toISOString() })
      return { success: true, id: parsed.id, status: 'paused' }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'resumeRecurringExpense',
      description: 'Reativa gasto recorrente pausado.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: resumeRecurringExpenseSchema,
    _execute: async (args:any) => {
      const parsed = resumeRecurringExpenseSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.recurringExpenses.find((r:any)=> r.id===parsed.id)
      if (!existing) throw new Error('Não encontrado')
      if (existing.isActive) return { success: true, alreadyActive: true }
      useFinanceStore.getState().saveRecurringExpense({ ...existing, isActive: true, updatedAt: new Date().toISOString() })
      return { success: true, id: parsed.id, status: 'active' }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteRecurringExpense',
      description: 'EXCLUSÃO: remove gasto recorrente. Requer confirmação.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: deleteRecurringExpenseSchema,
    _execute: async (args:any) => {
      const parsed = deleteRecurringExpenseSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.recurringExpenses.find((r:any)=> r.id===parsed.id)
      if (!existing) throw new Error('Não encontrado')
      useFinanceStore.getState().deleteRecurringExpense(parsed.id)
      return { success: true, deletedId: parsed.id, name: existing.name }
    }
  },
  // Recurring Income
  {
    type: 'function' as const,
    function: {
      name: 'createRecurringIncome',
      description: 'Cria receita recorrente (salário, freelance fixo etc).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amountInCents: { type: 'number' },
          category: { type: 'string' },
          accountId: { type: 'string' },
          frequency: { type: 'string', enum: ['weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly'] },
          dueDay: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name','amountInCents','category','accountId','frequency','startDate'],
      },
    },
    _zod: createRecurringIncomeSchema,
    _execute: async (args:any) => {
      const parsed = createRecurringIncomeSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const acc = s.accounts.find((a:any)=>a.id===parsed.accountId)
      if (!acc) throw new Error('Conta não encontrada')
      const now = new Date().toISOString()
      const rec = { id: uid(), name: parsed.name.trim(), amountInCents: parsed.amountInCents, category: parsed.category.trim(), accountId: parsed.accountId, frequency: parsed.frequency, dueDay: parsed.dueDay, startDate: parsed.startDate, endDate: parsed.endDate, description: parsed.description, isActive: true, createdAt: now, updatedAt: now }
      useFinanceStore.getState().saveRecurringIncome?.(rec)
      if (!useFinanceStore.getState().saveRecurringIncome) {
        const state = useFinanceStore.getState() as any
        useFinanceStore.setState({ recurringIncomes: [...(state.recurringIncomes??[]), rec] } as any)
        try { const { indexedDbRepository } = await import('../../data/repository'); const data = { ...state, recurringIncomes: [...(state.recurringIncomes??[]), rec] }; await indexedDbRepository.save(data as any) } catch {}
      }
      return { success: true, recurringIncome: { id: rec.id, name: rec.name, amount: money(rec.amountInCents) } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateRecurringIncome',
      description: 'Atualiza receita recorrente.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          amountInCents: { type: 'number' },
          category: { type: 'string' },
          accountId: { type: 'string' },
          frequency: { type: 'string', enum: ['weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly'] },
          dueDay: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          description: { type: 'string' },
          isActive: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    _zod: updateRecurringIncomeSchema,
    _execute: async (args:any) => {
      const parsed = updateRecurringIncomeSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = (s.recurringIncomes ?? []).find((r:any)=> r.id===parsed.id)
      if (!existing) throw new Error('Receita recorrente não encontrada')
      const updated = { ...existing, ...parsed, updatedAt: new Date().toISOString() }
      useFinanceStore.getState().saveRecurringIncome?.(updated)
      if (!useFinanceStore.getState().saveRecurringIncome) {
        const state = useFinanceStore.getState() as any
        const next = (state.recurringIncomes??[]).map((r:any)=> r.id===parsed.id? updated : r)
        useFinanceStore.setState({ recurringIncomes: next } as any)
        try { const { indexedDbRepository } = await import('../../data/repository'); await indexedDbRepository.save({ ...state, recurringIncomes: next } as any) } catch {}
      }
      return { success: true, recurringIncome: { id: updated.id, name: updated.name } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteRecurringIncome',
      description: 'EXCLUSÃO: remove receita recorrente. Requer confirmação.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: deleteRecurringIncomeSchema,
    _execute: async (args:any) => {
      const parsed = deleteRecurringIncomeSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = (s.recurringIncomes ?? []).find((r:any)=> r.id===parsed.id)
      if (!existing) throw new Error('Não encontrado')
      useFinanceStore.getState().deleteRecurringIncome?.(parsed.id)
      if (!useFinanceStore.getState().deleteRecurringIncome) {
        const state = useFinanceStore.getState() as any
        const next = (state.recurringIncomes??[]).filter((r:any)=> r.id!==parsed.id)
        useFinanceStore.setState({ recurringIncomes: next } as any)
        try { const { indexedDbRepository } = await import('../../data/repository'); await indexedDbRepository.save({ ...state, recurringIncomes: next } as any) } catch {}
      }
      return { success: true, deletedId: parsed.id }
    }
  },
]
