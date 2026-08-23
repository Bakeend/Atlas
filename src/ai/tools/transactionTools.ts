import { money, today, uid } from '../../domain'
import { useFinanceStore } from '../../store'
import { createTransactionSchema, deleteTransactionSchema, updateTransactionSchema } from '../schemas/toolSchemas'

export const transactionTools = [
  {
    type: 'function' as const,
    function: {
      name: 'createTransaction',
      description: 'Cria transação (receita, despesa ou transferência). Valores em centavos, data YYYY-MM-DD. Antes de criar, verifique categoria e conta existentes quando possível.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['income','expense','transfer'] },
          amountInCents: { type: 'number', description: 'valor em centavos, ex 8990 = R$ 89,90' },
          description: { type: 'string' },
          category: { type: 'string', description: 'categoria, ex Alimentação' },
          accountId: { type: 'string', description: 'ID da conta' },
          destinationAccountId: { type: 'string', description: 'ID conta destino se transfer' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          note: { type: 'string' },
          recurringExpenseId: { type: 'string' },
          recurringOccurrenceDate: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['type','amountInCents','description','category','accountId','date'],
      },
    },
    _zod: createTransactionSchema,
    _execute: async (args:any) => {
      const parsed = createTransactionSchema.parse(args)
      const s = useFinanceStore.getState() as any
      // validate account exists
      const acc = s.accounts.find((a:any)=>a.id===parsed.accountId)
      if (!acc) throw new Error(`Conta não encontrada: ${parsed.accountId}`)
      if (parsed.type==='transfer') {
        const dest = s.accounts.find((a:any)=>a.id===parsed.destinationAccountId)
        if (!dest) throw new Error(`Conta destino não encontrada`)
      }
      const tx = {
        id: uid(),
        type: parsed.type,
        amountCents: parsed.amountInCents,
        description: parsed.description.trim(),
        category: parsed.category.trim(),
        accountId: parsed.accountId,
        destinationAccountId: parsed.destinationAccountId,
        date: parsed.date,
        note: parsed.note,
        recurringExpenseId: parsed.recurringExpenseId,
        recurringOccurrenceDate: parsed.recurringOccurrenceDate,
        createdAt: new Date().toISOString(),
      }
      useFinanceStore.getState().addTransaction(tx)
      // log
      try { useFinanceStore.getState().addAiLog?.({ id: uid(), timestamp: new Date().toISOString(), conversationId: 'current', action: 'createTransaction', entityType: 'transaction', entityId: tx.id, status: 'success', requiresConfirmation: false, detail: `${tx.type} ${tx.description} ${money(tx.amountCents)}` }) } catch {}
      return { success: true, transaction: { id: tx.id, description: tx.description, amount: money(tx.amountCents), amountCents: tx.amountCents, date: tx.date, category: tx.category, accountId: tx.accountId } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateTransaction',
      description: 'Atualiza transação existente por ID. Envie apenas campos que deseja alterar.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['income','expense','transfer'] },
          amountInCents: { type: 'number' },
          description: { type: 'string' },
          category: { type: 'string' },
          accountId: { type: 'string' },
          destinationAccountId: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          note: { type: 'string' },
        },
        required: ['id'],
      },
    },
    _zod: updateTransactionSchema,
    _execute: async (args:any) => {
      const parsed = updateTransactionSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.transactions.find((t:any)=> t.id===parsed.id && !t.deletedAt)
      if (!existing) throw new Error('Transação não encontrada')
      const updated = {
        ...existing,
        type: parsed.type ?? existing.type,
        amountCents: parsed.amountInCents ?? existing.amountCents,
        description: parsed.description?.trim() ?? existing.description,
        category: parsed.category?.trim() ?? existing.category,
        accountId: parsed.accountId ?? existing.accountId,
        destinationAccountId: parsed.destinationAccountId !== undefined ? parsed.destinationAccountId : existing.destinationAccountId,
        date: parsed.date ?? existing.date,
        note: parsed.note !== undefined ? parsed.note : existing.note,
      }
      // validate transfer
      if (updated.type==='transfer' && !updated.destinationAccountId) throw new Error('Transfer precisa destinationAccountId')
      if (updated.type==='transfer' && updated.accountId===updated.destinationAccountId) throw new Error('Origem e destino diferentes')
      useFinanceStore.getState().updateTransaction(updated)
      return { success: true, transaction: { id: updated.id, description: updated.description, amount: money(updated.amountCents), date: updated.date } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteTransaction',
      description: 'EXCLUSÃO: remove (soft delete) transação por ID. Requer confirmação explícita do usuário.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: deleteTransactionSchema,
    _execute: async (args:any) => {
      const parsed = deleteTransactionSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.transactions.find((t:any)=> t.id===parsed.id && !t.deletedAt)
      if (!existing) throw new Error('Transação não encontrada ou já excluída')
      useFinanceStore.getState().softDeleteTransaction(parsed.id)
      return { success: true, deletedId: parsed.id, description: existing.description }
    }
  },
]
