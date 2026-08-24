import { accountBalance, categories as defaultCategories, money, today } from '../../domain'
import type { FinanceData } from '../../domain'
import { useFinanceStore } from '../../store'
import { calculateCommittedAmount } from '../../recurring'
import { calculateForecast, getAverageDailyVariable, summarizeForecast } from '../../forecast/calculate'
import { calculateFreeMoney } from '../services/financialEngine'
import { getEffectiveFinancialProfile } from '../../onboarding/onboardingProfile'

export interface FinancialContext {
  today: string
  currency: string
  accountSummary: Array<{ id: string; name: string; type: string; balanceCents: number; balanceFormatted: string; archived: boolean }>
  totalBalanceCents: number
  totalBalanceFormatted: string
  currentMonth: string
  currentMonthSummary: { incomeCents: number; expenseCents: number; incomeFormatted: string; expenseFormatted: string }
  upcomingCommitments: { next7DaysCents: number; next30DaysCents: number; countActive: number }
  activeBudgets: Array<{ category: string; month: string; limitCents: number; usedCents: number; percent: number }>
  activeGoals: Array<{ title: string; targetCents: number; currentCents: number; progress: number }>
  categoryList: string[]
  recentTransactionsCount: number
  forecastNext30: { endBalanceCents: number; minBalanceCents: number }
  freeMoney: { freeCents: number; freeFormatted: string; totalFormatted: string; committedFormatted: string; periodLabel: string; isNegative: boolean; hasNextIncome: boolean }
  financialProfile?: { primaryGoal: string; organizationLevel: string; incomePattern: string; priorities: string[] }
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function buildFinancialContext(data?: FinanceData): FinancialContext {
  const state = data ?? useFinanceStore.getState() as unknown as FinanceData
  const t = today()
  const month = t.slice(0, 7)
  const live = state.transactions.filter(tx => !tx.deletedAt)
  const accounts = state.accounts.filter(a => !a.archived)
  const accountSummary = state.accounts.map(a => {
    const bal = accountBalance(a, live)
    return { id: a.id, name: a.name, type: a.type, balanceCents: bal, balanceFormatted: money(bal), archived: a.archived }
  })
  const totalBalanceCents = accounts.reduce((s, a) => s + accountBalance(a, live), 0)
  const incomeCents = live.filter(tx => tx.type === 'income' && tx.date.startsWith(month)).reduce((s, tx) => s + tx.amountCents, 0)
  const expenseCents = live.filter(tx => tx.type === 'expense' && tx.date.startsWith(month)).reduce((s, tx) => s + tx.amountCents, 0)
  const commitments7 = calculateCommittedAmount(state.recurringExpenses, t, addDaysIso(t, 7), state.transactions)
  const commitments30 = calculateCommittedAmount(state.recurringExpenses, t, addDaysIso(t, 30), state.transactions)
  const activeBudgets = state.budgets.filter(b => b.month === month).map(b => {
    const used = live.filter(tx => tx.type === 'expense' && tx.category === b.category && tx.date.startsWith(month)).reduce((s, tx) => s + tx.amountCents, 0)
    return { category: b.category, month: b.month, limitCents: b.limitCents, usedCents: used, percent: b.limitCents ? Math.round(used / b.limitCents * 100) : 0 }
  })
  const activeGoals = (state.goals ?? []).map(g => ({ title: g.title, targetCents: g.targetAmountInCents, currentCents: g.currentAmountInCents, progress: g.targetAmountInCents ? Math.round(g.currentAmountInCents / g.targetAmountInCents * 100) : 0 }))

  const allCats = new Set<string>([...defaultCategories, ...(state.customCategories ?? []), ...live.map(tx => tx.category)])
  // also add goals categories if any
  const categoryList = Array.from(allCats)

  // forecast summary (quick)
  let forecastNext30 = { endBalanceCents: totalBalanceCents, minBalanceCents: totalBalanceCents }
  try {
    const points = calculateForecast({ accounts: state.accounts, transactions: state.transactions, recurringExpenses: state.recurringExpenses, startDate: t, days: 30, realistic: state.forecastRealistic ?? true })
    const summary = summarizeForecast(points, totalBalanceCents)
    forecastNext30 = { endBalanceCents: summary.endBalance, minBalanceCents: summary.minBalance }
  } catch {}

  // free money summary (deterministic)
  let freeMoney = { freeCents: totalBalanceCents, freeFormatted: money(totalBalanceCents), totalFormatted: money(totalBalanceCents), committedFormatted: money(0), periodLabel: 'Próximos 30 dias', isNegative: false, hasNextIncome: false }
  try {
    const fm = calculateFreeMoney({ period: 'nextIncome', data: state })
    freeMoney = { freeCents: fm.freeCents, freeFormatted: fm.freeFormatted, totalFormatted: fm.totalFormatted, committedFormatted: fm.committedFormatted, periodLabel: fm.period.label, isNegative: fm.isNegative, hasNextIncome: fm.period.hasNextIncome }
  } catch {}

  return {
    today: t,
    currency: 'BRL',
    accountSummary,
    totalBalanceCents,
    totalBalanceFormatted: money(totalBalanceCents),
    currentMonth: month,
    currentMonthSummary: { incomeCents, expenseCents, incomeFormatted: money(incomeCents), expenseFormatted: money(expenseCents) },
    upcomingCommitments: { next7DaysCents: commitments7, next30DaysCents: commitments30, countActive: state.recurringExpenses.filter(r => r.isActive).length },
    activeBudgets,
    activeGoals,
    categoryList,
    recentTransactionsCount: live.length,
    forecastNext30,
    freeMoney,
    // Bloco compacto — o onboarding inteiro nunca vai para o modelo (spec §50).
    financialProfile: (() => {
      const profile = getEffectiveFinancialProfile(state as Partial<FinanceData>)
      if (!profile) return undefined
      return { primaryGoal: profile.primaryGoal, organizationLevel: profile.organizationLevel, incomePattern: profile.incomePattern, priorities: profile.priorities.slice(0, 3) }
    })(),
  }
}

export function sanitizeContextForPrompt(ctx: FinancialContext): string {
  // Minimal, no IDs, no sensitive internals
  return JSON.stringify({
    today: ctx.today,
    currency: ctx.currency,
    totalBalance: ctx.totalBalanceFormatted,
    freeMoney: ctx.freeMoney.freeFormatted,
    freeMoneyPeriod: ctx.freeMoney.periodLabel,
    freeMoneyIsNegative: ctx.freeMoney.isNegative,
    totalCommitted: ctx.freeMoney.committedFormatted,
    currentMonth: ctx.currentMonth,
    monthIncome: ctx.currentMonthSummary.incomeFormatted,
    monthExpense: ctx.currentMonthSummary.expenseFormatted,
    next7DaysCommitted: money(ctx.upcomingCommitments.next7DaysCents),
    next30DaysCommitted: money(ctx.upcomingCommitments.next30DaysCents),
    categories: ctx.categoryList.slice(0, 20),
    budgets: ctx.activeBudgets.map(b => ({ category: b.category, limit: money(b.limitCents), used: money(b.usedCents), percent: `${b.percent}%` })),
    goals: ctx.activeGoals.map(g => ({ title: g.title, progress: `${g.progress}%`, target: money(g.targetCents) })),
    forecast30: { end: money(ctx.forecastNext30.endBalanceCents), min: money(ctx.forecastNext30.minBalanceCents) },
    financialProfile: ctx.financialProfile,
  }, null, 2)
}

export function buildContextMessage(): { role: 'system'; content: string } {
  const ctx = buildFinancialContext()
  return {
    role: 'system',
    content: `Contexto financeiro atual (resumo sanitizado):\n${sanitizeContextForPrompt(ctx)}\n\nUse ferramentas para obter detalhes precisos. Nunca invente valores.`,
  }
}
