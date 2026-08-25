import { z } from 'zod'
import { money, today } from '../../domain'
import type { RecurringExpense } from '../../domain'
import { getOccurrencesBetween } from '../../recurring'
import { useFinanceStore, waitForPersist } from '../../store'

const markReceivedSchema = z.object({
  recurringIncomeId: z.string().min(1),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  actualAmountInCents: z.number().int().positive().optional(),
  accountId: z.string().min(1).optional(),
})

export const recurringIncomeReceiptTools = [{
  type: 'function' as const,
  function: {
    name: 'markRecurringIncomeReceived',
    description: 'Registra uma ocorrência de receita recorrente como recebida. Cria a receita realizada vinculada à ocorrência para não projetá-la novamente.',
    parameters: {
      type: 'object',
      properties: {
        recurringIncomeId: { type: 'string' },
        occurrenceDate: { type: 'string', description: 'Ocorrência esperada YYYY-MM-DD' },
        receiptDate: { type: 'string', description: 'Data em que entrou na conta YYYY-MM-DD; padrão hoje' },
        actualAmountInCents: { type: 'number', description: 'Valor efetivamente recebido; padrão valor cadastrado' },
        accountId: { type: 'string', description: 'Conta que recebeu; padrão conta da receita recorrente' },
      },
      required: ['recurringIncomeId','occurrenceDate'],
    },
  },
  _zod: markReceivedSchema,
  _execute: async (args: unknown) => {
    const parsed = markReceivedSchema.parse(args)
    const state = useFinanceStore.getState() as any
    const income = (state.recurringIncomes ?? []).find((item: any) => item.id === parsed.recurringIncomeId)
    if (!income) throw new Error('Receita recorrente não encontrada')
    const validOccurrence = getOccurrencesBetween(income as RecurringExpense, parsed.occurrenceDate, parsed.occurrenceDate).includes(parsed.occurrenceDate)
    if (!validOccurrence) throw new Error('A data informada não é uma ocorrência válida desta receita recorrente')
    const accountId = parsed.accountId ?? income.accountId
    const account = state.accounts.find((item: any) => item.id === accountId)
    if (!account) throw new Error('Conta de recebimento não encontrada')
    const amount = parsed.actualAmountInCents ?? income.amountInCents
    const recorded = useFinanceStore.getState().markRecurringIncomeReceived({
      recurringIncomeId: income.id,
      occurrenceDate: parsed.occurrenceDate,
      receiptDate: parsed.receiptDate ?? today(),
      actualAmountInCents: amount,
      accountId,
    })
    if (!recorded) throw new Error('Esta ocorrência já foi registrada como recebida')
    await waitForPersist()
    return { success: true, recurringIncomeId: income.id, occurrenceDate: parsed.occurrenceDate, amountInCents: amount, amount: money(amount), accountId }
  },
}]