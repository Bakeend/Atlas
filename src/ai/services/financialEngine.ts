import { accountBalance, money, today, uid } from '../../domain'
import type { FinanceData, PaymentAllocationPlan, PaymentAllocationItem, RecurringExpense } from '../../domain'
import { useFinanceStore } from '../../store'
import { calculateCommittedAmount, getOccurrencesBetween, getUnrecordedOccurrencesBetween } from '../../recurring'
import { calculateForecast, getAverageDailyVariable, summarizeForecast } from '../../forecast/calculate'
import { calculateBudgetUsage, calculateRemainingEssentialBudgets } from '../../financialView'

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getTotalBalance(data?: FinanceData): number {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const live = s.transactions.filter(t => !t.deletedAt)
  return s.accounts.filter(a => !a.archived).reduce((sum, a) => sum + accountBalance(a, live), 0)
}

export function getVirtualReservesTotal(data?: FinanceData): number {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const plans = (s as any).paymentAllocationPlans ?? []
  let total = 0
  for (const plan of plans) {
    if (plan.status !== 'applied') continue
    for (const it of plan.items) {
      if (it.isConsumed) continue
      if (it.type === 'bill' || it.type === 'free') continue
      total += it.amountInCents
    }
  }
  return total
}

export function getVirtualReservesBreakdown(data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const plans = (s as any).paymentAllocationPlans ?? []
  let budgetEssential = 0
  let budgetOther = 0
  let goalReserve = 0
  let safety = 0
  let other = 0
  const essentialSet = new Set(['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação'])
  for (const plan of plans) {
    if (plan.status !== 'applied') continue
    for (const it of plan.items) {
      if (it.isConsumed) continue
      if (it.type === 'bill' || it.type === 'free') continue
      if (it.type === 'budget') {
        if (it.categoryId && essentialSet.has(it.categoryId)) budgetEssential += it.amountInCents
        else if (it.categoryId) budgetOther += it.amountInCents
        else budgetOther += it.amountInCents
      } else if (it.type === 'goal' || it.type === 'reserve') {
        goalReserve += it.amountInCents
      } else if (it.type === 'safety') {
        safety += it.amountInCents
      } else {
        other += it.amountInCents
      }
    }
  }
  return { budgetEssential, budgetOther, goalReserve, safety, other, total: budgetEssential + budgetOther + goalReserve + safety + other }
}

/* ── Dinheiro Livre helpers ── */
const ESSENTIAL_BUDGET_CATEGORIES = new Set(['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação'])

function lastDayOfMonthIso(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

function estimateVariableAmount(expense: import('../../domain').RecurringExpense, data: FinanceData): { amount: number; isEstimated: boolean } {
  if (!expense.isVariable) return { amount: expense.amountInCents, isEstimated: false }
  const t = today()
  const start = addDaysIso(t, -90)
  const live = data.transactions.filter(tx => !tx.deletedAt && tx.type === 'expense' && tx.category === expense.category && tx.date >= start && tx.date <= t)
  if (live.length >= 2) {
    const sum = live.reduce((s, tx) => s + tx.amountCents, 0)
    const avg = Math.round(sum / live.length)
    return { amount: avg, isEstimated: true }
  }
  return { amount: expense.amountInCents, isEstimated: live.length > 0 }
}

function getFreeMoneyPeriodBounds(
  period: 'nextIncome' | 'thisMonth' | 'next30' | 'custom' = 'nextIncome',
  opts: { customStart?: string; customEnd?: string } = {},
  data?: FinanceData
): { start: string; end: string; label: string; days: number; hasNextIncome: boolean; nextIncomeDate: string | null } {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  if (period === 'thisMonth') {
    const end = lastDayOfMonthIso(t)
    const days = diffDays(t, end) + 1
    return { start: t, end, label: 'Este mês', days, hasNextIncome: false, nextIncomeDate: null }
  }
  if (period === 'next30') {
    const end = addDaysIso(t, 30)
    return { start: t, end, label: 'Próximos 30 dias', days: 31, hasNextIncome: false, nextIncomeDate: null }
  }
  if (period === 'custom') {
    const start = opts.customStart ?? t
    const end = opts.customEnd ?? addDaysIso(t, 30)
    const days = diffDays(start, end) + 1
    return { start, end, label: `Personalizado ${start} → ${end}`, days, hasNextIncome: false, nextIncomeDate: null }
  }
  const next = calculateNextIncome(s)
  if (next.found && next.nextDate && next.nextDate >= t) {
    const end = addDaysIso(next.nextDate, -1)
    const actualEnd = end >= t ? end : t
    const days = diffDays(t, actualEnd) + 1
    return { start: t, end: actualEnd, label: `Até seu próximo pagamento em ${diffDays(t, next.nextDate)} dias`, days, hasNextIncome: true, nextIncomeDate: next.nextDate }
  }
  const end = addDaysIso(t, 30)
  return { start: t, end, label: 'Próximos 30 dias (sem próximo recebimento)', days: 31, hasNextIncome: false, nextIncomeDate: null }
}

function calculateCommittedBillsDetailed(start: string, end: string, data: FinanceData) {
  const details: Array<{ id: string; name: string; amountCents: number; amountFormatted: string; dueDate: string; category: string; isEstimated: boolean; isVariable: boolean }> = []
  let total = 0
  for (const exp of data.recurringExpenses) {
    if (!exp.isActive) continue
    const occs = getUnrecordedOccurrencesBetween(exp as any, start, end, data.transactions)
    if (!occs.length) continue
    const est = estimateVariableAmount(exp, data)
    for (const due of occs) {
      const amt = est.amount
      total += amt
      details.push({
        id: exp.id,
        name: exp.name,
        amountCents: amt,
        amountFormatted: money(amt),
        dueDate: due,
        category: exp.category,
        isEstimated: est.isEstimated,
        isVariable: exp.isVariable,
      })
    }
  }
  details.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return { total, details }
}

function getEssentialBudgetsDetails(data: FinanceData, period: { start: string; end: string }) {
  const remaining = calculateRemainingEssentialBudgets({
    budgets: data.budgets,
    transactions: data.transactions,
    recurringExpenses: data.recurringExpenses,
    startMonth: period.start.slice(0, 7),
    endMonth: period.end.slice(0, 7),
    essentialCategories: ESSENTIAL_BUDGET_CATEGORIES,
  })
  return {
    total: remaining.total,
    details: remaining.details.map(item => ({
      category: item.category,
      month: item.month,
      limitCents: item.remainingCents,
      limitFormatted: money(item.remainingCents),
    })),
  }
}

function getGoalsReserveDetails(data: FinanceData) {
  const virtual = getVirtualReservesBreakdown(data)
  let total = virtual.goalReserve
  const details: Array<{ id: string; title: string; amountCents: number; amountFormatted: string; isVirtual: boolean }> = []
  if (virtual.goalReserve > 0 && data.goals.length) {
    details.push({ id: 'virtual-goals', title: 'Metas e reservas (virtual)', amountCents: virtual.goalReserve, amountFormatted: money(virtual.goalReserve), isVirtual: true })
  } else if (virtual.goalReserve > 0) {
    details.push({ id: 'virtual-reserve', title: 'Reserva', amountCents: virtual.goalReserve, amountFormatted: money(virtual.goalReserve), isVirtual: true })
  }
  if (total === 0 && data.goals.length) {
    const t = today()
    for (const g of data.goals) {
      if (!g.deadline) continue
      const deadline = g.deadline
      if (deadline <= t) continue
      const remaining = Math.max(0, g.targetAmountInCents - g.currentAmountInCents)
      if (remaining <= 0) continue
      const daysToDeadline = diffDays(t, deadline)
      const months = Math.max(1, Math.ceil(daysToDeadline / 30))
      const monthly = Math.round(remaining / months)
      if (monthly > 0) {
        total += monthly
        details.push({ id: g.id, title: g.title, amountCents: monthly, amountFormatted: money(monthly), isVirtual: false })
      }
    }
  }
  return { total, details, virtualTotal: virtual.goalReserve }
}

export interface FreeMoneyResult {
  totalCents: number
  totalFormatted: string
  committedCents: number
  committedFormatted: string
  committedDetails: Array<{ id: string; name: string; amountCents: number; amountFormatted: string; dueDate: string; category: string; isEstimated: boolean; isVariable: boolean }>
  essentialBudgetsCents: number
  essentialBudgetsFormatted: string
  essentialBudgetsDetails: Array<{ category: string; month: string; limitCents: number; limitFormatted: string }>
  goalsCents: number
  goalsFormatted: string
  goalsDetails: Array<{ id: string; title: string; amountCents: number; amountFormatted: string; isVirtual: boolean }>
  virtualReservesCents: number
  virtualReservesFormatted: string
  safetyMarginCents: number
  safetyMarginFormatted: string
  safetyMarginPercent: number
  freeCents: number
  freeFormatted: string
  isNegative: boolean
  deficitCents: number
  deficitFormatted: string | null
  period: { start: string; end: string; label: string; days: number; hasNextIncome: boolean; nextIncomeDate: string | null }
  isInsufficientData: boolean
}

export function calculateFreeMoney(
  opts: { period?: 'nextIncome' | 'thisMonth' | 'next30' | 'custom'; customStart?: string; customEnd?: string; data?: FinanceData } = {}
): FreeMoneyResult {
  const s = opts.data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const period = getFreeMoneyPeriodBounds(opts.period ?? 'nextIncome', { customStart: opts.customStart, customEnd: opts.customEnd }, s)
  const total = getTotalBalance(s)
  const committed = calculateCommittedBillsDetailed(period.start, period.end, s)
  const essential = getEssentialBudgetsDetails(s, period)
  const goals = getGoalsReserveDetails(s)
  const virtual = getVirtualReservesBreakdown(s)
  const marginPct = s.safetyMarginPercent ?? 10

  // O orçamento formal é a fonte de verdade quando existe. O saldo já reflete o realizado
  // e committed.total já cobre as contas recorrentes; aqui reservamos apenas o restante variável.
  const effectiveEssential = essential.details.length ? essential.total : virtual.budgetEssential
  const effectiveGoals = Math.max(goals.total, virtual.goalReserve)
  const baseForSafety = Math.max(0, total - committed.total - effectiveEssential - effectiveGoals)
  const computedSafety = marginPct > 0 && baseForSafety > 0 ? Math.round(baseForSafety * (marginPct / 100)) : 0
  const effectiveSafety = Math.max(computedSafety, virtual.safety)
  const free = total - committed.total - effectiveEssential - effectiveGoals - effectiveSafety

  const isNegative = free < 0
  const deficit = isNegative ? Math.abs(free) : 0
  const isInsufficientData = total === 0 && committed.total === 0 && essential.total === 0 && goals.total === 0 && virtual.total === 0

  return {
    totalCents: total,
    totalFormatted: money(total),
    committedCents: committed.total,
    committedFormatted: money(committed.total),
    committedDetails: committed.details,
    essentialBudgetsCents: effectiveEssential,
    essentialBudgetsFormatted: money(effectiveEssential),
    essentialBudgetsDetails: essential.details,
    goalsCents: effectiveGoals,
    goalsFormatted: money(effectiveGoals),
    goalsDetails: goals.details,
    virtualReservesCents: virtual.total,
    virtualReservesFormatted: money(virtual.total),
    safetyMarginCents: effectiveSafety,
    safetyMarginFormatted: money(effectiveSafety),
    safetyMarginPercent: marginPct,
    freeCents: free,
    freeFormatted: money(free),
    isNegative,
    deficitCents: deficit,
    deficitFormatted: deficit ? money(deficit) : null,
    period,
    isInsufficientData,
  }
}

export const getFreeMoney = calculateFreeMoney
export const getFreeMoneyBreakdown = calculateFreeMoney
export const calculateFreeMoneyDetailed = calculateFreeMoney

export function calculateAvailableMoney(untilDate?: string, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const end = untilDate ?? addDaysIso(t, 30)
  const total = getTotalBalance(s)
  const committed = calculateCommittedBillsDetailed(t, end, s).total
  const virtualReserves = getVirtualReservesTotal(s)
  const available = total - committed - virtualReserves
  return { totalCents: total, committedCents: committed, virtualReservesCents: virtualReserves, availableCents: available, totalFormatted: money(total), committedFormatted: money(committed), virtualReservesFormatted: money(virtualReserves), availableFormatted: money(available), period: { start: t, end } }
}

export function calculateCommitted(start?: string, end?: string, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const startIso = start ?? t
  const endIso = end ?? addDaysIso(t, 30)
  const detailed = calculateCommittedBillsDetailed(startIso, endIso, s)
  return { committedCents: detailed.total, committedFormatted: money(detailed.total), period: { start: startIso, end: endIso }, details: detailed.details }
}

export function calculateNextIncome(data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const incomes = (s.recurringIncomes ?? []).filter(r => r.isActive)
  if (!incomes.length) return { found: false as const, nextDate: null, amountCents: 0, formatted: money(0) }

  let best: { date: string; amount: number; name: string } | null = null
  for (const inc of incomes) {
    const occurrences = getOccurrencesBetween(inc as unknown as RecurringExpense, t, addDaysIso(t, 60))
    const date = occurrences.find(occurrenceDate => !s.transactions.some(transaction =>
      !transaction.deletedAt &&
      transaction.type === 'income' &&
      transaction.recurringIncomeId === inc.id &&
      transaction.recurringIncomeOccurrenceDate === occurrenceDate
    ))
    if (!date) continue
    if (!best || date < best.date) best = { date, amount: inc.amountInCents, name: inc.name }
  }
  if (!best) return { found: false as const, nextDate: null, amountCents: 0, formatted: money(0) }
  return { found: true as const, nextDate: best.date, amountCents: best.amount, formatted: money(best.amount), name: best.name }
}

export function analyzeSpending(startDate?: string, endDate?: string, groupBy: 'category' | 'month' = 'category', data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const live = s.transactions.filter(t => !t.deletedAt && t.type === 'expense')
  const start = startDate ?? `${today().slice(0,7)}-01`
  const end = endDate ?? today()
  const filtered = live.filter(t => t.date >= start && t.date <= end)
  const totalCents = filtered.reduce((sum, t) => sum + t.amountCents, 0)
  if (groupBy === 'category') {
    const byCat = new Map<string, number>()
    for (const t of filtered) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amountCents)
    const breakdown = Array.from(byCat.entries()).map(([category, cents]) => ({ category, cents, formatted: money(cents), percent: totalCents ? Math.round(cents/totalCents*100) : 0 })).sort((a,b)=>b.cents-a.cents)
    return { period: { start, end }, totalCents, totalFormatted: money(totalCents), breakdown }
  }
  const byMonth = new Map<string, number>()
  for (const t of filtered) { const m = t.date.slice(0,7); byMonth.set(m, (byMonth.get(m)??0)+t.amountCents) }
  const breakdown = Array.from(byMonth.entries()).map(([month, cents])=>({ month, cents, formatted: money(cents) })).sort((a,b)=>a.month.localeCompare(b.month))
  return { period: { start, end }, totalCents, totalFormatted: money(totalCents), breakdown }
}

export function detectAnomalies(months = 6, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const anomalies: Array<{ category: string; currentCents: number; averageCents: number; deltaPercent: number; currentFormatted: string; averageFormatted: string }> = []
  const currentMonth = t.slice(0,7)
  const live = s.transactions.filter(tx => !tx.deletedAt && tx.type==='expense')
  const allCats = Array.from(new Set(live.map(tx=>tx.category)))
  for (const cat of allCats) {
    const current = live.filter(tx=> tx.category===cat && tx.date.startsWith(currentMonth)).reduce((sum,tx)=>sum+tx.amountCents,0)
    if (!current) continue
    let sumPrev = 0; let count = 0
    for (let i=1;i<=months;i++) {
      const d = new Date(`${t}T12:00:00`); d.setMonth(d.getMonth()-i)
      const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const v = live.filter(tx=> tx.category===cat && tx.date.startsWith(m)).reduce((sum,tx)=>sum+tx.amountCents,0)
      sumPrev += v; count++
    }
    const avg = count ? Math.round(sumPrev/count) : 0
    if (avg && current > avg*1.3) {
      const deltaPercent = Math.round((current-avg)/avg*100)
      anomalies.push({ category: cat, currentCents: current, averageCents: avg, deltaPercent, currentFormatted: money(current), averageFormatted: money(avg) })
    }
  }
  return anomalies.sort((a,b)=>b.deltaPercent-a.deltaPercent)
}

export function getSpendingAnomaliesTool(months = 6) {
  return detectAnomalies(months)
}

export function getCashFlow(days = 30, realistic = true, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const points = calculateForecast({ accounts: s.accounts, transactions: s.transactions, recurringExpenses: s.recurringExpenses, recurringIncomes: s.recurringIncomes, startDate: today(), days, realistic: realistic && (s.forecastRealistic ?? true) })
  const total = getTotalBalance(s)
  const summary = summarizeForecast(points, total)
  const avg = getAverageDailyVariable(s.transactions, today())
  return { days, realistic, points: points.slice(0, Math.min(points.length, 14)), summary: { endBalance: money(summary.endBalance), minBalance: money(summary.minBalance), totalRecurring: money(summary.totalRecurring), totalRecurringIncome: money(summary.totalRecurringIncome), totalVariable: money(summary.totalVariable) }, avg: { expensePerDay: money(avg.avgExpense), incomePerDay: money(avg.avgIncome) } }
}

export type SpendClass = 'reserved' | 'essential' | 'discretionary'

const DISCRETIONARY_KEYWORDS = /(restaurante|lanchonete|bar|cinema|show|ingresso|lazer|jogo|pub|balada|ifood|delivery.*lazer)/i
const ESSENTIAL_CATEGORIES = new Set(['Alimentação', 'Saúde', 'Educação', 'Transporte'])
const RESERVED_CATEGORIES = new Set(['Moradia', 'Assinaturas'])

export function classifyTransaction(tx: import('../../domain').FinanceTransaction): SpendClass {
  if (tx.recurringExpenseId) return 'reserved'
  if (RESERVED_CATEGORIES.has(tx.category)) return 'reserved'
  if (tx.category === 'Lazer' || tx.category === 'Outros') {
    if (DISCRETIONARY_KEYWORDS.test(tx.description)) return 'discretionary'
    return 'discretionary'
  }
  if (ESSENTIAL_CATEGORIES.has(tx.category)) {
    if (DISCRETIONARY_KEYWORDS.test(tx.description)) return 'discretionary'
    return 'essential'
  }
  if (DISCRETIONARY_KEYWORDS.test(`${tx.category} ${tx.description}`)) return 'discretionary'
  return 'essential'
}

function diffDays(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T12:00:00`).getTime()
  const b = new Date(`${bIso}T12:00:00`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export interface SafeDailyResult {
  freeMoneyInCents: number
  freeMoneyFormatted: string
  daysUntilNextIncome: number | null
  nextIncomeDate: string | null
  nextIncomeAmountInCents: number
  nextIncomeFormatted: string
  nextIncomeName?: string
  distributableInCents: number
  safetyReserveInCents: number
  safetyMarginPercent: number
  safeDailySpendInCents: number | null
  safeDailyFormatted: string | null
  spentTodayInCents: number
  spentTodayFormatted: string
  remainingTodayInCents: number | null
  remainingTodayFormatted: string | null
  percentUsed: number | null
  status: 'no_income' | 'normal' | 'near_limit' | 'reached' | 'over' | 'negative_free'
  hasNextIncome: boolean
  nextBill?: { name: string; amountInCents: number; amountFormatted: string; date: string } | null
  today: string
}

export function calculateSafeDailySpend(data?: FinanceData, overrideToday?: string): SafeDailyResult {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = overrideToday ?? today()
  const total = getTotalBalance(s)
  const margin = (s.safetyMarginPercent ?? 10) / 100
  const nextIncome = calculateNextIncome(s)
  const hasNextIncome = nextIncome.found && !!nextIncome.nextDate

  let days: number | null = null
  let nextDate: string | null = null
  let freeMoney = total
  let committed = 0
  const virtualReserves = getVirtualReservesTotal(s)

  if (hasNextIncome) {
    nextDate = nextIncome.nextDate!
    days = diffDays(t, nextDate)
    if (days === 0) days = 1
    const endForFree = addDaysIso(nextDate, -1)
    committed = endForFree >= t ? calculateCommittedBillsDetailed(t, endForFree, s).total : 0
    freeMoney = total - committed - virtualReserves
  } else {
    days = null
    committed = calculateCommittedBillsDetailed(t, addDaysIso(t, 30), s).total
    freeMoney = total - committed - virtualReserves
  }

  const spentToday = s.transactions
    .filter(tx => !tx.deletedAt && tx.type === 'expense' && tx.date === t)
    .filter(tx => classifyTransaction(tx) !== 'reserved')
    .reduce((sum, tx) => sum + tx.amountCents, 0)

  const totalBeforeTodaySpends = total + spentToday
  const freeMoneyBeforeToday = totalBeforeTodaySpends - committed - virtualReserves
  const baseForReserve = hasNextIncome ? freeMoneyBeforeToday : freeMoney
  const safetyReserve = hasNextIncome && baseForReserve > 0 ? Math.round(baseForReserve * margin) : 0
  const distributable = Math.max(0, (hasNextIncome ? baseForReserve : freeMoney) - safetyReserve)

  let safeDaily: number | null = null
  if (hasNextIncome && days && days > 0) safeDaily = baseForReserve <= 0 ? 0 : Math.floor(distributable / days)

  let remaining: number | null = null
  let percent: number | null = null
  let status: SafeDailyResult['status'] = 'normal'
  if (!hasNextIncome) status = 'no_income'
  else if (freeMoney < 0) { status = 'negative_free'; remaining = safeDaily !== null ? safeDaily - spentToday : null }
  else if (safeDaily === null) status = 'no_income'
  else {
    remaining = safeDaily - spentToday
    percent = safeDaily > 0 ? Math.round((spentToday / safeDaily) * 100) : (spentToday > 0 ? 100 : 0)
    if (remaining < 0) status = 'over'
    else if (remaining === 0) status = 'reached'
    else if (percent !== null && percent >= 80) status = 'near_limit'
  }

  let nextBill: SafeDailyResult['nextBill'] = null
  try {
    let best: { r: any; date: string } | null = null
    for (const r of s.recurringExpenses.filter(r => r.isActive)) {
      const occ = getUnrecordedOccurrencesBetween(r as any, t, addDaysIso(t, 60), s.transactions)[0]
      if (occ && (!best || occ < best.date)) best = { r, date: occ }
    }
    if (best) nextBill = { name: best.r.name, amountInCents: best.r.amountInCents, amountFormatted: money(best.r.amountInCents), date: best.date }
  } catch {}

  return {
    freeMoneyInCents: freeMoney,
    freeMoneyFormatted: money(freeMoney),
    daysUntilNextIncome: days,
    nextIncomeDate: nextDate,
    nextIncomeAmountInCents: nextIncome.found ? nextIncome.amountCents : 0,
    nextIncomeFormatted: nextIncome.found ? money(nextIncome.amountCents) : money(0),
    nextIncomeName: (nextIncome as any).name,
    distributableInCents: distributable,
    safetyReserveInCents: safetyReserve,
    safetyMarginPercent: (s.safetyMarginPercent ?? 10),
    safeDailySpendInCents: safeDaily,
    safeDailyFormatted: safeDaily !== null ? money(safeDaily) : null,
    spentTodayInCents: spentToday,
    spentTodayFormatted: money(spentToday),
    remainingTodayInCents: remaining,
    remainingTodayFormatted: remaining !== null ? money(remaining) : null,
    percentUsed: percent,
    status,
    hasNextIncome,
    nextBill,
    today: t,
  }
}

export function simulateDailySpend(amountInCents: number, data?: FinanceData, overrideToday?: string) {
  const base = calculateSafeDailySpend(data, overrideToday)
  if (!base.hasNextIncome || base.daysUntilNextIncome === null || base.safeDailySpendInCents === null) {
    return {
      ...base,
      simulatedAmountInCents: amountInCents,
      simulatedFormatted: money(amountInCents),
      freeAfterInCents: base.freeMoneyInCents - amountInCents,
      freeAfterFormatted: money(base.freeMoneyInCents - amountInCents),
      newDailyInCents: null,
      newDailyFormatted: null,
      isSimulation: true as const,
      note: 'Cadastre seu próximo recebimento para simulação precisa. Estimativa em 30 dias.',
    }
  }
  const freeAfter = base.freeMoneyInCents - amountInCents
  const daysAfter = Math.max(0, base.daysUntilNextIncome - 1)
  const safetyAfter = freeAfter > 0 ? Math.round(freeAfter * (base.safetyMarginPercent / 100)) : 0
  const distributableAfter = Math.max(0, freeAfter - safetyAfter)
  const newDaily = daysAfter > 0 ? Math.floor(distributableAfter / daysAfter) : 0
  return {
    base,
    simulatedAmountInCents: amountInCents,
    simulatedFormatted: money(amountInCents),
    freeBeforeInCents: base.freeMoneyInCents,
    freeBeforeFormatted: base.freeMoneyFormatted,
    freeAfterInCents: freeAfter,
    freeAfterFormatted: money(freeAfter),
    daysBefore: base.daysUntilNextIncome,
    daysAfter,
    newDailyInCents: newDaily,
    newDailyFormatted: money(newDaily),
    safetyReserveAfter: safetyAfter,
    isSimulation: true as const,
    nextIncomeDate: base.nextIncomeDate,
  }
}

const DEFAULT_PRIORITY: import('../../domain').AllocationPriority[] = ['overdue','essential','bills','food','transport','goals','reserve','leisure','free']

export function getEffectivePriority(data?: FinanceData): import('../../domain').AllocationPriority[] {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  return (s as any).paymentAllocationPriority ?? DEFAULT_PRIORITY
}

function occurrenceKey(recurringExpenseId: string, occurrenceDate: string) {
  return `${recurringExpenseId}|${occurrenceDate}`
}

function getAlreadyReservedBillOccurrences(data: FinanceData): Set<string> {
  const plans = (data as any).paymentAllocationPlans ?? []
  const keys = new Set<string>()
  for (const plan of plans) {
    if (plan.status !== 'applied') continue
    for (const item of plan.items) {
      if (item.isConsumed || !item.recurringExpenseId || !item.recurringOccurrenceDate) continue
      keys.add(occurrenceKey(item.recurringExpenseId, item.recurringOccurrenceDate))
    }
  }
  return keys
}

export function preparePaymentAllocationPlan(
  params: { receivedAmountInCents: number; sourceTransactionId?: string; periodEnd?: string; safetyMarginPercent?: number },
  data?: FinanceData
): PaymentAllocationPlan {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const received = params.receivedAmountInCents
  if (!Number.isInteger(received) || received <= 0) throw new Error('Valor recebido deve ser maior que zero')
  const periodStart = t
  let periodEnd = params.periodEnd
  if (!periodEnd) {
    const next = calculateNextIncome(s)
    periodEnd = next.found && next.nextDate ? addDaysIso(next.nextDate, -1) : addDaysIso(t, 30)
    if (periodEnd < periodStart) periodEnd = addDaysIso(t, 30)
  }
  const safetyPct = params.safetyMarginPercent ?? (s.safetyMarginPercent ?? 10)
  const safetyAmount = Math.round(received * (safetyPct / 100))
  let remaining = received
  const items: PaymentAllocationItem[] = []
  const addItem = (label: string, type: PaymentAllocationItem['type'], amount: number, extra?: Partial<PaymentAllocationItem>) => {
    if (amount <= 0) return
    items.push({ id: uid(), label, type, amountInCents: amount, ...extra })
    remaining -= amount
  }
  const alreadyReserved = getAlreadyReservedBillOccurrences(s)
  const priority = getEffectivePriority(s)
  const has = (p: import('../../domain').AllocationPriority) => priority.includes(p)

  const addBillOccurrence = (r: RecurringExpense, date: string) => {
    const key = occurrenceKey(r.id, date)
    if (alreadyReserved.has(key) || items.some(item => item.recurringExpenseId === r.id && item.recurringOccurrenceDate === date)) return
    addItem(r.name, 'bill', r.amountInCents, { recurringExpenseId: r.id, recurringOccurrenceDate: date, categoryId: r.category })
  }

  if (has('overdue')) {
    const overdue = s.recurringExpenses.filter(r => r.isActive).flatMap(r =>
      getUnrecordedOccurrencesBetween(r as any, r.startDate, addDaysIso(t, -1), s.transactions).map(date => ({ r, date }))
    ).sort((a, b) => a.date.localeCompare(b.date))
    for (const { r, date } of overdue) addBillOccurrence(r, date)
  }

  if (has('essential') || has('bills')) {
    const upcoming = s.recurringExpenses.filter(r => r.isActive).flatMap(r =>
      getUnrecordedOccurrencesBetween(r as any, t, periodEnd!, s.transactions).map(date => ({ r, date }))
    ).sort((a, b) => a.date.localeCompare(b.date))
    for (const { r, date } of upcoming) addBillOccurrence(r, date)
  }

  const month = t.slice(0, 7)
  const addRemainingBudget = (category: string, fallbackCents: number) => {
    const budget = s.budgets.find(b => b.category === category && b.month === month)
    const amount = budget ? calculateBudgetUsage({ budget, transactions: s.transactions, recurringExpenses: s.recurringExpenses }).remainingCents : fallbackCents
    addItem(category, 'budget', amount, { categoryId: category })
  }

  if (has('food')) {
    const foodBudget = s.budgets.find(b => b.category === 'Alimentação' && b.month === month)
    const prefFood = (s as any).paymentAllocationPreferences?.find((p:any)=> p.rule?.toLowerCase().includes('alimenta'))
    let foodAmount = foodBudget ? calculateBudgetUsage({ budget: foodBudget, transactions: s.transactions, recurringExpenses: s.recurringExpenses }).remainingCents : 60000
    if (prefFood) {
      const m = prefFood.rule.match(/R\$\s*([\d\.,]+)/)
      if (m) { const cents = Math.round(Number(m[1].replace(/\./g,'').replace(',','.'))*100); if (cents>0) foodAmount = Math.min(foodAmount, cents) }
    }
    addItem('Alimentação', 'budget', foodAmount, { categoryId: 'Alimentação' })
  }

  if (has('transport')) addRemainingBudget('Transporte', 30000)

  if (has('goals') || has('reserve')) {
    const goals = (s.goals ?? []).slice(0, 2)
    if (goals.length && has('goals')) {
      for (const g of goals) {
        const need = Math.max(0, g.targetAmountInCents - g.currentAmountInCents)
        const prefReserve = (s as any).paymentAllocationPreferences?.find((p:any)=> p.rule?.toLowerCase().includes('guarda') || p.rule?.toLowerCase().includes('reserva'))
        let pct = 0.11
        if (prefReserve) {
          const m = prefReserve.rule.match(/(\d+)\s*%/)
          if (m) pct = Number(m[1])/100
          const mv = prefReserve.rule.match(/R\$\s*([\d\.,]+)/)
          if (mv) {
            const fixed = Math.round(Number(mv[1].replace(/\./g,'').replace(',','.'))*100)
            const allocFixed = Math.min(need, fixed)
            if (allocFixed>0) { addItem(g.title, 'goal', allocFixed, { goalId: g.id }); continue }
          }
        }
        const alloc = Math.min(need, Math.round(received * pct))
        if (alloc > 0) addItem(g.title, 'goal', alloc, { goalId: g.id })
      }
    }
    if (!goals.length && has('reserve')) {
      const pref = (s as any).paymentAllocationPreferences?.find((p:any)=> p.rule?.toLowerCase().includes('reserva'))
      let pct = 0.11
      if (pref) {
        const m = pref.rule.match(/(\d+)\s*%/)
        if (m) pct = Number(m[1])/100
      }
      addItem('Reserva', 'reserve', Math.round(received * pct))
    }
  }

  if (has('reserve') || has('free')) addItem('Margem de segurança', 'safety', safetyAmount)

  if (has('leisure')) {
    const leisureBudget = s.budgets.find(b => b.category === 'Lazer' && b.month === month)
    if (leisureBudget) {
      const remainingLeisure = calculateBudgetUsage({ budget: leisureBudget, transactions: s.transactions, recurringExpenses: s.recurringExpenses }).remainingCents
      addItem('Lazer', 'budget', remainingLeisure, { categoryId: 'Lazer' })
    }
  }

  const totalAllocated = items.reduce((sum, it) => sum + it.amountInCents, 0)
  const freeAmount = received - totalAllocated
  items.push({ id: uid(), label: 'Livre', type: 'free', amountInCents: Math.max(0, freeAmount) })
  return {
    id: uid(),
    sourceTransactionId: params.sourceTransactionId,
    receivedAmountInCents: received,
    periodStart,
    periodEnd: periodEnd!,
    items,
    freeAmountInCents: freeAmount,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
