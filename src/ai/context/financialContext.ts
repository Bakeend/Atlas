import { accountBalance, categories as defaultCategories, money, today } from '../../domain'
import type { FinanceData } from '../../domain'
import { useFinanceStore } from '../../store'
import { calculateCommittedAmount } from '../../recurring'
import { calculateForecast, summarizeForecast } from '../../forecast/calculate'
import { calculateBudgetUsage, calculateMonthlyExpenseView, calculateMonthlyIncomeView } from '../../financialView'
import { calculateFreeMoney } from '../services/financialEngine'

export interface FinancialContext {
  today: string
  currency: string
  accountSummary: Array<{ id: string; name: string; type: string; balanceCents: number; balanceFormatted: string; archived: boolean }>
  totalBalanceCents: number
  totalBalanceFormatted: string
  currentMonth: string
  currentMonthSummary: {
    realizedIncomeCents: number; committedIncomeCents: number; projectedIncomeCents: number
    realizedExpenseCents: number; committedExpenseCents: number; projectedExpenseCents: number
  }
  upcomingCommitments: { next7DaysCents: number; next30DaysCents: number; countActive: number }
  activeBudgets: Array<{ category: string; month: string; limitCents: number; realizedCents: number; committedCents: number; projectedCents: number; remainingCents: number; percentProjected: number }>
  activeGoals: Array<{ title: string; targetCents: number; currentCents: number; progress: number }>
  categoryList: string[]
  recentTransactionsCount: number
  forecastNext30: { endBalanceCents: number; minBalanceCents: number }
  freeMoney: { freeCents: number; freeFormatted: string; totalFormatted: string; committedFormatted: string; periodLabel: string; isNegative: boolean; hasNextIncome: boolean }
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  const totalBalanceCents = accounts.reduce((sum, account) => sum + accountBalance(account, live), 0)
  const incomeView = calculateMonthlyIncomeView(live, state.recurringIncomes ?? [], month)
  const expenseView = calculateMonthlyExpenseView(live, state.recurringExpenses, month)
  const commitments7 = calculateCommittedAmount(state.recurringExpenses, t, addDaysIso(t, 7), state.transactions)
  const commitments30 = calculateCommittedAmount(state.recurringExpenses, t, addDaysIso(t, 30), state.transactions)
  const activeBudgets = state.budgets.filter(b => b.month === month).map(budget => {
    const usage = calculateBudgetUsage({ budget, transactions: state.transactions, recurringExpenses: state.recurringExpenses })
    return { category: budget.category, month: budget.month, limitCents: budget.limitCents, realizedCents: usage.realizedCents, committedCents: usage.committedCents, projectedCents: usage.projectedCents, remainingCents: usage.remainingCents, percentProjected: usage.percentProjected }
  })
  const activeGoals = (state.goals ?? []).map(g => ({ title: g.title, targetCents: g.targetAmountInCents, currentCents: g.currentAmountInCents, progress: g.targetAmountInCents ? Math.round(g.currentAmountInCents / g.targetAmountInCents * 100) : 0 }))

  const allCats = new Set<string>([...defaultCategories, ...(state.customCategories ?? []), ...live.map(tx => tx.category)])
  const categoryList = Array.from(allCats)

  let forecastNext30 = { endBalanceCents: totalBalanceCents, minBalanceCents: totalBalanceCents }
  try {
    const points = calculateForecast({ accounts: state.accounts, transactions: state.transactions, recurringExpenses: state.recurringExpenses, recurringIncomes: state.recurringIncomes, startDate: t, days: 30, realistic: state.forecastRealistic ?? true })
    const summary = summarizeForecast(points, totalBalanceCents)
    forecastNext30 = { endBalanceCents: summary.endBalance, minBalanceCents: summary.minBalance }
  } catch {}

  let freeMoney = { freeCents: totalBalanceCents, freeFormatted: money(totalBalanceCents), totalFormatted: money(totalBalanceCents), committedFormatted: money(0), periodLabel: 'Próximos 30 dias', isNegative: false, hasNextIncome: false }
  try {
    const fm = calculateFreeMoney({ period: 'nextIncome', data: state })
    freeMoney = { freeCents: fm.freeCents, freeFormatted: fm.freeFormatted, totalFormatted: fm.totalFormatted, committedFormatted: fm.committedFormatted, periodLabel: fm.period.label, isNegative: fm.isNegative, hasNextIncome: fm.period.hasNextIncome }
  } catch {}

  return {
    today: t, currency: 'BRL', accountSummary, totalBalanceCents, totalBalanceFormatted: money(totalBalanceCents), currentMonth: month,
    currentMonthSummary: {
      realizedIncomeCents: incomeView.realizedCents, committedIncomeCents: incomeView.committedCents, projectedIncomeCents: incomeView.projectedCents,
      realizedExpenseCents: expenseView.realizedCents, committedExpenseCents: expenseView.committedCents, projectedExpenseCents: expenseView.projectedCents,
    },
    upcomingCommitments: { next7DaysCents: commitments7, next30DaysCents: commitments30, countActive: state.recurringExpenses.filter(r => r.isActive).length },
    activeBudgets, activeGoals, categoryList, recentTransactionsCount: live.length, forecastNext30, freeMoney,
  }
}

export function sanitizeContextForPrompt(ctx: FinancialContext): string {
  return JSON.stringify({
    today: ctx.today,
    currency: ctx.currency,
    totalBalance: ctx.totalBalanceFormatted,
    freeMoney: ctx.freeMoney.freeFormatted,
    freeMoneyPeriod: ctx.freeMoney.periodLabel,
    freeMoneyIsNegative: ctx.freeMoney.isNegative,
    totalCommitted: ctx.freeMoney.committedFormatted,
    currentMonth: ctx.currentMonth,
    monthIncome: { realized: money(ctx.currentMonthSummary.realizedIncomeCents), toReceive: money(ctx.currentMonthSummary.committedIncomeCents), projected: money(ctx.currentMonthSummary.projectedIncomeCents) },
    monthExpense: { realized: money(ctx.currentMonthSummary.realizedExpenseCents), committed: money(ctx.currentMonthSummary.committedExpenseCents), projected: money(ctx.currentMonthSummary.projectedExpenseCents) },
    next7DaysCommitted: money(ctx.upcomingCommitments.next7DaysCents),
    next30DaysCommitted: money(ctx.upcomingCommitments.next30DaysCents),
    categories: ctx.categoryList.slice(0, 20),
    budgets: ctx.activeBudgets.map(b => ({ category: b.category, limit: money(b.limitCents), realized: money(b.realizedCents), committed: money(b.committedCents), projected: money(b.projectedCents), remaining: money(b.remainingCents), projectedPercent: `${b.percentProjected}%` })),
    goals: ctx.activeGoals.map(g => ({ title: g.title, progress: `${g.progress}%`, target: money(g.targetCents) })),
    forecast30: { end: money(ctx.forecastNext30.endBalanceCents), min: money(ctx.forecastNext30.minBalanceCents) },
  }, null, 2)
}

export function buildContextMessage(): { role: 'system'; content: string } {
  const ctx = buildFinancialContext()
  return { role: 'system', content: `Contexto financeiro atual (resumo sanitizado):\n${sanitizeContextForPrompt(ctx)}\n\nDiferencie valores realizados, comprometidos e projetados. Use ferramentas para obter detalhes precisos e nunca invente valores.` }
}
