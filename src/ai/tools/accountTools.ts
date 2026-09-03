import { money, uid } from '../../domain'
import { useFinanceStore, waitForPersist } from '../../store'
import { createAccountSchema, deleteAccountSchema, updateAccountSchema } from '../schemas/toolSchemas'

export const accountTools = [
  {
    type: 'function' as const,
    function: {
      name: 'createAccount',
      description: 'Cria conta/carteira. Tipos: checking, savings, cash, wallet, investment. initialBalanceCents em centavos.',
      parameters: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', enum: ['checking','savings','cash','wallet','investment'] }, initialBalanceCents: { type: 'number' }, color: { type: 'string', description: '#RRGGBB' } }, required: ['name','type'] },
    },
    _zod: createAccountSchema,
    _execute: async (args:any) => {
      const parsed = createAccountSchema.parse(args)
      const acc = { id: uid(), name: parsed.name.trim(), type: parsed.type, initialBalanceCents: parsed.initialBalanceCents ?? 0, color: parsed.color ?? '#2F80ED', archived: false, createdAt: new Date().toISOString() }
      useFinanceStore.getState().addAccount(acc)
      return { success: true, account: { id: acc.id, name: acc.name, balance: money(acc.initialBalanceCents) } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateAccount',
      description: 'Atualiza conta por ID (nome, tipo, cor, arquivar).',
      parameters: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string', enum: ['checking','savings','cash','wallet','investment'] }, color: { type: 'string' }, archived: { type: 'boolean' } }, required: ['id'] },
    },
    _zod: updateAccountSchema,
    _execute: async (args:any) => {
      const parsed = updateAccountSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.accounts.find((a:any)=> a.id===parsed.id)
      if (!existing) throw new Error('Conta não encontrada')
      const updated = { ...existing, name: parsed.name ?? existing.name, type: parsed.type ?? existing.type, color: parsed.color ?? existing.color, archived: parsed.archived ?? existing.archived }
      useFinanceStore.getState().updateAccount(updated)
      return { success: true, account: { id: updated.id, name: updated.name } }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteAccount',
      description: 'EXCLUSÃO: remove apenas conta sem referências. Se transações, recorrências, receitas recorrentes ou metas usarem a conta, arquiva em vez de excluir. Requer confirmação.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: deleteAccountSchema,
    _execute: async (args:any) => {
      const parsed = deleteAccountSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const existing = s.accounts.find((a:any)=> a.id===parsed.id)
      if (!existing) throw new Error('Conta não encontrada')

      const references = {
        transactions: s.transactions.some((t:any)=> !t.deletedAt && (t.accountId===parsed.id || t.destinationAccountId===parsed.id)),
        recurringExpenses: s.recurringExpenses.some((r:any)=> r.accountId===parsed.id),
        recurringIncomes: (s.recurringIncomes ?? []).some((r:any)=> r.accountId===parsed.id),
        goals: (s.goals ?? []).some((g:any)=> g.accountId===parsed.id),
      }
      const hasReferences = Object.values(references).some(Boolean)
      if (hasReferences) {
        useFinanceStore.getState().updateAccount({ ...existing, archived: true })
        try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. O arquivamento não foi concluído.') }
        const usedBy = Object.entries(references).filter(([, used]) => used).map(([key]) => key)
        return { success: true, archived: true, id: parsed.id, referencedBy: usedBy, message: 'A conta possui dados vinculados e foi arquivada para preservar o histórico.' }
      }

      const removed = useFinanceStore.getState().removeAccount(parsed.id)
      if (!removed) throw new Error('Conta não encontrada')
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. A exclusão não foi concluída.') }
      return { success: true, deletedId: parsed.id }
    }
  },
]
