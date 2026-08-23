import { z } from 'zod'
import { money } from '../../domain'
import { calculateSafeDailySpend, simulateDailySpend } from '../services/financialEngine'

const getSafeDailySpendSchema = z.object({})
const simulateDailySpendSchema = z.object({ amountInCents: z.number().int().min(1).max(100_000_000) })

export const safeSpendTools = [
  {
    type: 'function' as const,
    function: {
      name: 'getSafeDailySpend',
      description: 'Calcula quanto o usuário pode gastar hoje sem comprometer contas. Usa dinheiro livre, próximo pagamento, margem de segurança, gastos já realizados hoje (sem reservas). Retorna limite diário, restante hoje, próxima conta e próximo recebimento.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    _zod: getSafeDailySpendSchema,
    _execute: async () => {
      const r = calculateSafeDailySpend()
      return {
        today: r.today,
        freeMoneyInCents: r.freeMoneyInCents,
        freeMoney: r.freeMoneyFormatted,
        daysUntilNextIncome: r.daysUntilNextIncome,
        nextIncomeDate: r.nextIncomeDate,
        nextIncomeAmount: r.nextIncomeFormatted,
        nextIncomeName: r.nextIncomeName,
        safeDailyInCents: r.safeDailySpendInCents,
        safeDaily: r.safeDailyFormatted,
        spentTodayInCents: r.spentTodayInCents,
        spentToday: r.spentTodayFormatted,
        remainingTodayInCents: r.remainingTodayInCents,
        remainingToday: r.remainingTodayFormatted,
        percentUsed: r.percentUsed,
        status: r.status,
        hasNextIncome: r.hasNextIncome,
        safetyMarginPercent: r.safetyMarginPercent,
        safetyReserve: money(r.safetyReserveInCents),
        distributable: money(r.distributableInCents),
        nextBill: r.nextBill,
        message: r.status === 'no_income' ? 'Cadastre seu próximo recebimento para calcular um limite diário mais preciso.' :
                 r.status === 'over' ? `Você ultrapassou o valor recomendado de hoje em ${money(Math.abs(r.remainingTodayInCents ?? 0))}. O limite médio para os próximos ${(r.daysUntilNextIncome ?? 1)-1} dias foi ajustado.` :
                 r.status === 'near_limit' ? `Restam ${r.remainingTodayFormatted} hoje.` : undefined,
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'simulateDailySpend',
      description: 'Simula gastar um valor hoje sem registrar despesa. Mostra como ficaria dinheiro livre e novo limite médio. amountInCents em centavos.',
      parameters: { type: 'object', properties: { amountInCents: { type: 'number', description: 'valor em centavos ex 20000 = R$200' } }, required: ['amountInCents'] },
    },
    _zod: simulateDailySpendSchema,
    _execute: async (args:any) => {
      const parsed = simulateDailySpendSchema.parse(args)
      const sim: any = simulateDailySpend(parsed.amountInCents)
      const baseData = sim.base ?? sim
      if (!baseData.hasNextIncome) {
        return {
          simulation: true,
          amountInCents: parsed.amountInCents,
          amount: money(parsed.amountInCents),
          freeBefore: sim.freeBeforeFormatted ?? sim.freeMoneyFormatted ?? baseData.freeMoneyFormatted,
          freeAfter: sim.freeAfterFormatted,
          newDaily: sim.newDailyFormatted,
          nextIncomeDate: sim.nextIncomeDate ?? baseData.nextIncomeDate,
          note: sim.note ?? baseData.note,
          hasNextIncome: false,
        }
      }
      const base = sim.base as any
      return {
        simulation: true,
        amountInCents: parsed.amountInCents,
        amount: money(parsed.amountInCents),
        freeBeforeInCents: sim.freeBeforeInCents,
        freeBefore: sim.freeBeforeFormatted,
        freeAfterInCents: sim.freeAfterInCents,
        freeAfter: sim.freeAfterFormatted,
        newDailyInCents: sim.newDailyInCents,
        newDaily: sim.newDailyFormatted,
        daysBefore: sim.daysBefore,
        daysAfter: sim.daysAfter,
        nextIncomeDate: sim.nextIncomeDate,
        message: `Se você gastar ${money(parsed.amountInCents)} hoje: Dinheiro livre: ${sim.freeBeforeFormatted} → ${sim.freeAfterFormatted}. Novo limite médio: ${sim.newDailyFormatted}/dia. Próximo pagamento em ${sim.daysAfter} dias.`,
      }
    }
  },
]
