import { z } from 'zod'
import { money } from '../../domain'
import { calculateFreeMoney, calculateCommitted } from '../services/financialEngine'

const periodEnum = z.enum(['nextIncome', 'thisMonth', 'next30', 'custom'])

const getFreeMoneySchema = z.object({
  period: periodEnum.optional().default('nextIncome'),
  customStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const getFreeMoneyBreakdownSchema = z.object({
  period: periodEnum.optional().default('nextIncome'),
  customStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const getCommittedAmountFreeSchema = z.object({
  period: periodEnum.optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const freeMoneyTools = [
  {
    type: 'function' as const,
    function: {
      name: 'getFreeMoney',
      description: 'Calcula Dinheiro Livre determinístico: saldo total menos contas obrigatórias futuras, recorrências previstas (com estimativa para variáveis), valores já reservados, metas e margem de segurança. Nunca inventa valores. Use period: nextIncome (padrão, até próximo salário), thisMonth, next30 ou custom. Retorna saldo, comprometido, livre e se está negativo.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['nextIncome', 'thisMonth', 'next30', 'custom'], description: 'Período para cálculo. Padrão nextIncome (até próximo recebimento)' },
          customStart: { type: 'string', description: 'YYYY-MM-DD início quando period=custom' },
          customEnd: { type: 'string', description: 'YYYY-MM-DD fim quando period=custom' },
        },
        required: [],
      },
    },
    _zod: getFreeMoneySchema,
    _execute: async (args: any) => {
      const parsed = getFreeMoneySchema.parse(args)
      const result = calculateFreeMoney({ period: parsed.period, customStart: parsed.customStart, customEnd: parsed.customEnd })
      if (result.isInsufficientData) {
        return {
          success: true,
          insufficient: true,
          message: 'Ainda não conseguimos calcular seu dinheiro livre. Cadastre seus próximos recebimentos e compromissos para melhorar o planejamento.',
          total: result.totalFormatted,
          period: result.period,
        }
      }
      return {
        success: true,
        totalCents: result.totalCents,
        total: result.totalFormatted,
        committedCents: result.committedCents,
        committed: result.committedFormatted,
        essentialBudgetsCents: result.essentialBudgetsCents,
        essentialBudgets: result.essentialBudgetsFormatted,
        goalsCents: result.goalsCents,
        goals: result.goalsFormatted,
        safetyMarginCents: result.safetyMarginCents,
        safetyMargin: result.safetyMarginFormatted,
        safetyMarginPercent: result.safetyMarginPercent,
        virtualReservesCents: result.virtualReservesCents,
        virtualReserves: result.virtualReservesFormatted,
        freeCents: result.freeCents,
        free: result.freeFormatted,
        isNegative: result.isNegative,
        deficitCents: result.deficitCents,
        deficit: result.deficitFormatted,
        period: result.period,
        message: result.isNegative
          ? `Seus compromissos previstos ultrapassam o saldo disponível em ${result.deficitFormatted}.`
          : `Dinheiro livre até ${result.period.label}: ${result.freeFormatted}`,
      }
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getFreeMoneyBreakdown',
      description: 'Detalhamento completo do Dinheiro Livre: saldo total, separado para contas (com flag Estimado para variáveis), orçamentos essenciais, metas e reservas, margem de segurança e livre. Use para explicar por que só há R$ X livres quando saldo é Y. Determinístico, sem invenção.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['nextIncome', 'thisMonth', 'next30', 'custom'], description: 'Período' },
          customStart: { type: 'string', description: 'YYYY-MM-DD' },
          customEnd: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: [],
      },
    },
    _zod: getFreeMoneyBreakdownSchema,
    _execute: async (args: any) => {
      const parsed = getFreeMoneyBreakdownSchema.parse(args)
      const r = calculateFreeMoney({ period: parsed.period, customStart: parsed.customStart, customEnd: parsed.customEnd })
      if (r.isInsufficientData) {
        return {
          success: true,
          insufficient: true,
          message: 'Ainda não conseguimos calcular seu dinheiro livre. Cadastre seus próximos recebimentos e compromissos para melhorar o planejamento.',
          period: r.period,
        }
      }
      return {
        success: true,
        breakdown: {
          saldoTotal: { cents: r.totalCents, formatted: r.totalFormatted },
          separadoParaContas: {
            cents: r.committedCents,
            formatted: r.committedFormatted,
            detalhes: r.committedDetails.map(d => ({
              nome: d.name,
              valor: d.amountFormatted,
              vencimento: d.dueDate,
              categoria: d.category,
              estimado: d.isEstimated ? 'Estimado' : 'Fixo',
              variavel: d.isVariable,
            })),
          },
          orcamentosEssenciais: {
            cents: r.essentialBudgetsCents,
            formatted: r.essentialBudgetsFormatted,
            detalhes: r.essentialBudgetsDetails,
          },
          metasEReservas: {
            cents: r.goalsCents,
            formatted: r.goalsFormatted,
            detalhes: r.goalsDetails,
          },
          margemDeSeguranca: {
            cents: r.safetyMarginCents,
            formatted: r.safetyMarginFormatted,
            percent: r.safetyMarginPercent,
          },
          valoresJaReservados: {
            cents: r.virtualReservesCents,
            formatted: r.virtualReservesFormatted,
          },
          livre: {
            cents: r.freeCents,
            formatted: r.freeFormatted,
            isNegative: r.isNegative,
            deficit: r.deficitFormatted,
          },
        },
        period: r.period,
        explicacao: r.isNegative
          ? `Seu dinheiro livre está negativo em ${r.deficitFormatted}. Seus compromissos (${r.committedFormatted}) + orçamentos (${r.essentialBudgetsFormatted}) + metas (${r.goalsFormatted}) + margem (${r.safetyMarginFormatted}) ultrapassam o saldo de ${r.totalFormatted}.`
          : `De ${r.totalFormatted} de saldo, ${r.committedFormatted} já estão separados para contas, ${r.essentialBudgetsFormatted} para orçamentos essenciais, ${r.goalsFormatted} para metas/reservas e ${r.safetyMarginFormatted} de margem. Livre: ${r.freeFormatted} até ${r.period.label}.`,
      }
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCommittedAmount',
      description: 'Valor total comprometido com recorrências no intervalo (com estimativa para variáveis e evitando dupla contagem se já pago). Use period ou startDate/endDate. Determinístico.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['nextIncome', 'thisMonth', 'next30', 'custom'], description: 'Atalho de período' },
          startDate: { type: 'string', description: 'YYYY-MM-DD início (alternativa a period)' },
          endDate: { type: 'string', description: 'YYYY-MM-DD fim' },
          customStart: { type: 'string', description: 'Alias para startDate' },
          customEnd: { type: 'string', description: 'Alias para customEnd' },
        },
        required: [],
      },
    },
    _zod: getCommittedAmountFreeSchema,
    _execute: async (args: any) => {
      const parsed = getCommittedAmountFreeSchema.parse(args)
      // prioridade para period, senão usa startDate/endDate legado
      let start: string | undefined
      let end: string | undefined
      if (parsed.period) {
        const r = calculateFreeMoney({ period: parsed.period, customStart: parsed.customStart ?? parsed.startDate, customEnd: parsed.customEnd ?? parsed.endDate })
        // committed já calculado dentro de freeMoney para o período
        const detailed = r.committedDetails
        return {
          success: true,
          committedCents: r.committedCents,
          committed: r.committedFormatted,
          period: r.period,
          details: detailed,
        }
      }
      // fallback legado startDate/endDate
      const s = parsed.startDate ?? parsed.customStart
      const e = parsed.endDate ?? parsed.customEnd
      const result = calculateCommitted(s, e)
      return {
        success: true,
        committedCents: (result as any).committedCents,
        committed: (result as any).committedFormatted,
        period: (result as any).period,
        details: (result as any).details ?? [],
      }
    },
  },
]
