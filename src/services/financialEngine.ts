import { accountBalance, money, today, uid } from '../domain'
import type { FinanceData, PaymentAllocationPlan, PaymentAllocationItem } from '../domain'
import { useFinanceStore } from '../store'
import { calculateCommittedAmount, getUnrecordedOccurrencesBetween } from '../recurring'
import { calculateForecast, getAverageDailyVariable, summarizeForecast } from '../forecast/calculate'
import { getAllPurchaseInstallments, getCardCommittedInPeriod, getCardSpendingByCategory } from '../creditCards/creditCardService'

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
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

/* ÔöÇÔöÇ Dinheiro Livre helpers ÔöÇÔöÇ */
const ESSENTIAL_BUDGET_CATEGORIES = new Set(['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação'])

function lastDayOfMonthIso(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

function estimateVariableAmount(expense: import('../domain').RecurringExpense, data: FinanceData): { amount: number; isEstimated: boolean } {
  if (!expense.isVariable) return { amount: expense.amountInCents, isEstimated: false }
  // 1) média histórica dos últimos 90 dias para mesma categoria
  const t = today()
  const start = addDaysIso(t, -90)
  const live = data.transactions.filter(tx => !tx.deletedAt && tx.type === 'expense' && tx.category === expense.category && tx.date >= start && tx.date <= t)
  if (live.length >= 2) {
    const sum = live.reduce((s, tx) => s + tx.amountCents, 0)
    const avg = Math.round(sum / live.length)
    // se média difere mais de 15% do cadastrado, considera estimado
    if (Math.abs(avg - expense.amountInCents) > expense.amountInCents * 0.15) {
      return { amount: avg, isEstimated: true }
    }
    return { amount: avg, isEstimated: true }
  }
  // 2) estimativa cadastrada (amountInCents) como fallback
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
  // nextIncome default
  const next = calculateNextIncome(s)
  if (next.found && next.nextDate && next.nextDate >= t) {
    const end = addDaysIso(next.nextDate, -1)
    // se end < start (salário hoje), usa 1 dia
    const actualEnd = end >= t ? end : t
    const days = diffDays(t, actualEnd) + 1
    return { start: t, end: actualEnd, label: `Até seu próximo pagamento em ${diffDays(t, next.nextDate)} dias`, days, hasNextIncome: true, nextIncomeDate: next.nextDate }
  }
  // fallback sem próximo recebimento
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
  // ordenar por data
  details.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return { total, details }
}

function getEssentialBudgetsDetails(data: FinanceData, period: { start: string; end: string }) {
  const months = new Set<string>()
  // coleta meses entre start e end (inclui ambos)
  let cur = period.start.slice(0, 7)
  const endMonth = period.end.slice(0, 7)
  // simples: se start e end meses diferentes, inclui ambos; se período > 60 dias, inclui intermediários
  // para MVP, inclui startMonth e endMonth (se diferentes)
  months.add(cur)
  months.add(endMonth)
  // se diff > 31 dias e tem mês intermediário, inclui
  const startD = new Date(`${period.start}T12:00:00`)
  const endD = new Date(`${period.end}T12:00:00`)
  const monthDiff = (endD.getFullYear() - startD.getFullYear()) * 12 + (endD.getMonth() - startD.getMonth())
  if (monthDiff > 1) {
    for (let i = 1; i < monthDiff; i++) {
      const d = new Date(startD)
      d.setMonth(d.getMonth() + i)
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
  }
  let total = 0
  const details: Array<{ category: string; month: string; limitCents: number; limitFormatted: string }> = []
  for (const b of data.budgets) {
    if (!ESSENTIAL_BUDGET_CATEGORIES.has(b.category)) continue
    if (!months.has(b.month)) continue
    total += b.limitCents
    details.push({ category: b.category, month: b.month, limitCents: b.limitCents, limitFormatted: money(b.limitCents) })
  }
  return { total, details }
}

function getGoalsReserveDetails(data: FinanceData) {
  const virtual = getVirtualReservesBreakdown(data)
  let total = virtual.goalReserve
  const details: Array<{ id: string; title: string; amountCents: number; amountFormatted: string; isVirtual: boolean }> = []
  // detalhes virtuais são agregados, não por meta individual — para breakdown, distribui por metas existentes se houver
  if (virtual.goalReserve > 0 && data.goals.length) {
    // distribui proporcionalmente? para MVP, cria um detalhe agregado
    details.push({ id: 'virtual-goals', title: 'Metas e reservas (virtual)', amountCents: virtual.goalReserve, amountFormatted: money(virtual.goalReserve), isVirtual: true })
  } else if (virtual.goalReserve > 0) {
    details.push({ id: 'virtual-reserve', title: 'Reserva', amountCents: virtual.goalReserve, amountFormatted: money(virtual.goalReserve), isVirtual: true })
  }
  // se não há virtual, mas há metas com deadline, estima mensal necessário
  if (total === 0 && data.goals.length) {
    const t = today()
    for (const g of data.goals) {
      if (!g.deadline) continue
      const deadline = g.deadline
      if (deadline <= t) continue
      const remaining = Math.max(0, g.targetAmountInCents - g.currentAmountInCents)
      if (remaining <= 0) continue
       // meses até deadline — usa dias para não quebrar em virada de mês (30 dias = 1 mês)
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
  cardCommittedCents: number
  cardCommittedFormatted: string
}

export function calculateFreeMoney(
  opts: { period?: 'nextIncome' | 'thisMonth' | 'next30' | 'custom'; customStart?: string; customEnd?: string; data?: FinanceData } = {}
): FreeMoneyResult {
  const s = opts.data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const period = getFreeMoneyPeriodBounds(opts.period ?? 'nextIncome', { customStart: opts.customStart, customEnd: opts.customEnd }, s)
  const total = getTotalBalance(s)
  const committed = calculateCommittedBillsDetailed(period.start, period.end, s)
  const cardCommitted = getCardCommittedInPeriod(s.creditCards ?? [], s.creditCardPurchases ?? [], s.creditCardInvoicePayments ?? [], period.start, period.end)
  const essential = getEssentialBudgetsDetails(s, period)
  const goals = getGoalsReserveDetails(s)
  const virtual = getVirtualReservesBreakdown(s)
  const marginPct = s.safetyMarginPercent ?? 10

  // Effective values: evita dupla contagem com virtual
  const effectiveEssential = Math.max(essential.total, virtual.budgetEssential)
  const effectiveGoals = Math.max(goals.total, virtual.goalReserve)
  // safety: se já há virtual safety, usa virtual, senão calcula sobre o que sobra
  const totalCommitted = committed.total + cardCommitted
  const baseForSafety = Math.max(0, total - totalCommitted - effectiveEssential - effectiveGoals)
  const computedSafety = marginPct > 0 && baseForSafety > 0 ? Math.round(baseForSafety * (marginPct / 100)) : 0
  const effectiveSafety = Math.max(computedSafety, virtual.safety)

  // virtualOther (budgetOther + other) não entra no cálculo essencial, mas se for reserva já está em goals; budgetOther (lazer) é discricionário e não deve reduzir livre, então ignoramos
  // free = total - committed - cardCommitted - effectiveEssential - effectiveGoals - effectiveSafety
  const free = total - totalCommitted - effectiveEssential - effectiveGoals - effectiveSafety

  const isNegative = free < 0
  const deficit = isNegative ? Math.abs(free) : 0
  const isInsufficientData = total === 0 && committed.total === 0 && cardCommitted === 0 && essential.total === 0 && goals.total === 0 && virtual.total === 0

  return {
    totalCents: total,
    totalFormatted: money(total),
    committedCents: totalCommitted,
    committedFormatted: money(totalCommitted),
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
    cardCommittedCents: cardCommitted,
    cardCommittedFormatted: money(cardCommitted),
  }
}

// aliases para tools IA — mantêm compatibilidade com nomes do spec
export const getFreeMoney = calculateFreeMoney
export const getFreeMoneyBreakdown = calculateFreeMoney
export const calculateFreeMoneyDetailed = calculateFreeMoney

export function calculateAvailableMoney(untilDate?: string, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const end = untilDate ?? addDaysIso(t, 30)
  const total = getTotalBalance(s)
  const committed = calculateCommittedBillsDetailed(t, end, s).total
  const cardCommitted = getCardCommittedInPeriod(s.creditCards ?? [], s.creditCardPurchases ?? [], s.creditCardInvoicePayments ?? [], t, end)
  const virtualReserves = getVirtualReservesTotal(s)
  const totalCommitted = committed + cardCommitted
  const available = total - totalCommitted - virtualReserves
  return { totalCents: total, committedCents: totalCommitted, virtualReservesCents: virtualReserves, availableCents: available, totalFormatted: money(total), committedFormatted: money(totalCommitted), virtualReservesFormatted: money(virtualReserves), availableFormatted: money(available), period: { start: t, end }, cardCommittedCents: cardCommitted, cardCommittedFormatted: money(cardCommitted) }
}

export function calculateCommitted(start?: string, end?: string, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const startIso = start ?? t
  const endIso = end ?? addDaysIso(t, 30)
  const detailed = calculateCommittedBillsDetailed(startIso, endIso, s)
  const cardCommitted = getCardCommittedInPeriod(s.creditCards ?? [], s.creditCardPurchases ?? [], s.creditCardInvoicePayments ?? [], startIso, endIso)
  return { committedCents: detailed.total + cardCommitted, committedFormatted: money(detailed.total + cardCommitted), period: { start: startIso, end: endIso }, details: detailed.details, cardCommittedCents: cardCommitted, cardCommittedFormatted: money(cardCommitted) }
}

export function calculateNextIncome(data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const incomes = (s.recurringIncomes ?? []).filter(r => r.isActive)
  if (!incomes.length) {
    // fallback: look for last income transaction to infer? return none
    return { found: false as const, nextDate: null, amountCents: 0, formatted: money(0) }
  }
  let best: { date: string; amount: number; name: string } | null = null
  for (const inc of incomes) {
    // reuse expense occurrence logic via RecurringExpense shape ÔÇö income has same fields
    const occ = getUnrecordedOccurrencesBetween(inc as any, t, addDaysIso(t, 60), [])
    const date = occ[0]
    if (!date) continue
    if (!best || date < best.date) best = { date, amount: inc.amountInCents, name: inc.name }
  }
  if (!best) return { found: false as const, nextDate: null, amountCents: 0, formatted: money(0) }
  return { found: true as const, nextDate: best.date, amountCents: best.amount, formatted: money(best.amount), name: best.name }
}

export function analyzeSpending(startDate?: string, endDate?: string, groupBy: 'category' | 'month' = 'category', data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const live = s.transactions.filter(t => !t.deletedAt && t.type === 'expense' && !t.isCreditCardInvoicePayment)
  const start = startDate ?? `${today().slice(0,7)}-01`
  const end = endDate ?? today()
  const filtered = live.filter(t => t.date >= start && t.date <= end)
  const cardByCat = getCardSpendingByCategory(s.creditCards ?? [], s.creditCardPurchases ?? [], start, end)
  // mescla gastos de cartão com transações normais
  let totalCents = filtered.reduce((sum, t) => sum + t.amountCents, 0)
  for (const v of cardByCat.values()) totalCents += v
  if (groupBy === 'category') {
    const byCat = new Map<string, number>()
    for (const t of filtered) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amountCents)
    for (const [cat, cents] of cardByCat) byCat.set(cat, (byCat.get(cat) ?? 0) + cents)
    const breakdown = Array.from(byCat.entries()).map(([category, cents]) => ({ category, cents, formatted: money(cents), percent: totalCents ? Math.round(cents/totalCents*100) : 0 })).sort((a,b)=>b.cents-a.cents)
    return { period: { start, end }, totalCents, totalFormatted: money(totalCents), breakdown }
  } else {
    const byMonth = new Map<string, number>()
    for (const t of filtered) { const m = t.date.slice(0,7); byMonth.set(m, (byMonth.get(m)??0)+t.amountCents) }
    for (const [cat, cents] of cardByCat) {
      // card spending é agrupado por closingDate, mas para visão mensal distribui proporcionalmente? simplifica: soma no mês do closing
      // já está em cardByCat por categoria, não por mês; para month group, recalcula via installments
    }
    // para month, precisa somar por mês do closing
    if (s.creditCards?.length && s.creditCardPurchases?.length) {
      const allInst = getAllPurchaseInstallments(s.creditCardPurchases ?? [], s.creditCards ?? [])
      for (const inst of allInst) {
        if (inst.closingDate < start || inst.closingDate > end) continue
        const m = inst.closingDate.slice(0,7)
        byMonth.set(m, (byMonth.get(m) ?? 0) + inst.amountCents)
      }
    }
    const breakdown = Array.from(byMonth.entries()).map(([month, cents])=>({ month, cents, formatted: money(cents) })).sort((a,b)=>a.month.localeCompare(b.month))
    return { period: { start, end }, totalCents, totalFormatted: money(totalCents), breakdown }
  }
}

export function detectAnomalies(months = 6, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const anomalies: Array<{ category: string; currentCents: number; averageCents: number; deltaPercent: number; currentFormatted: string; averageFormatted: string }> = []
  // group by category last `months` months vs current month
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
  const anomalies = detectAnomalies(months)
  return anomalies
}

export function getCashFlow(days = 30, realistic = true, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const points = calculateForecast({ accounts: s.accounts, transactions: s.transactions, recurringExpenses: s.recurringExpenses, startDate: today(), days, realistic: realistic && (s.forecastRealistic ?? true) })
  const total = getTotalBalance(s)
  const summary = summarizeForecast(points, total)
  const avg = getAverageDailyVariable(s.transactions, today())
  // incorpora faturas de cartão no fluxo futuro
  let cardTotal = 0
  try {
    const start = today()
    const end = addDaysIso(start, days - 1)
    cardTotal = getCardCommittedInPeriod(s.creditCards ?? [], s.creditCardPurchases ?? [], s.creditCardInvoicePayments ?? [], start, end)
  } catch { cardTotal = 0 }
  const adjustedEnd = summary.endBalance - cardTotal
  const adjustedMin = Math.min(summary.minBalance, adjustedEnd)
  return { days, realistic, points: points.slice(0, Math.min(points.length, 14)), summary: { endBalance: money(adjustedEnd), minBalance: money(adjustedMin), totalRecurring: money(summary.totalRecurring + cardTotal), totalVariable: money(summary.totalVariable) }, avg: { expensePerDay: money(avg.avgExpense), incomePerDay: money(avg.avgIncome) }, cardTotal, cardTotalFormatted: money(cardTotal) }
}

// ─── Classificação de gastos ───
export type SpendClass = 'reserved' | 'essential' | 'discretionary'

const DISCRETIONARY_KEYWORDS = /(restaurante|lanchonete|bar|cinema|show|ingresso|lazer|jogo|pub|balada|ifood|delivery.*lazer)/i
const ESSENTIAL_CATEGORIES = new Set(['Alimentação', 'Saúde', 'Educação', 'Transporte'])
const RESERVED_CATEGORIES = new Set(['Moradia', 'Assinaturas'])

export function classifyTransaction(tx: import('../domain').FinanceTransaction): SpendClass {
  if (tx.recurringExpenseId) return 'reserved'
  if (RESERVED_CATEGORIES.has(tx.category)) return 'reserved'
  if (tx.category === 'Lazer' || tx.category === 'Outros') {
  // Outros pode ser essencial ou discricionário; usa keyword para refinar
    if (DISCRETIONARY_KEYWORDS.test(tx.description)) return 'discretionary'
    if (tx.category === 'Lazer') return 'discretionary'
    return 'discretionary'
  }
  if (ESSENTIAL_CATEGORIES.has(tx.category)) {
    if (DISCRETIONARY_KEYWORDS.test(tx.description)) return 'discretionary'
    return 'essential'
  }
  // fallback: se descrição indica lazer, marca discretionary
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
    // se nextDate é hoje, days 0 -> trata como 1 (ainda hoje)
    if (days === 0) days = 1
    // comprometido até véspera do recebimento (não contar o dia do salário como gasto)
    const endForFree = addDaysIso(nextDate, -1)
    if (endForFree >= t) {
      const bills = calculateCommittedBillsDetailed(t, endForFree, s).total
      const cards = getCardCommittedInPeriod(s.creditCards ?? [], s.creditCardPurchases ?? [], s.creditCardInvoicePayments ?? [], t, endForFree)
      committed = bills + cards
    } else {
      committed = 0
    }
    freeMoney = total - committed - virtualReserves
  } else {
    // sem próxima receita: usa 30 dias como estimativa mas marca hasNextIncome false
    days = null
    // free = total - committed próximos 30 dias (para exibir)
    const bills = calculateCommittedBillsDetailed(t, addDaysIso(t, 30), s).total
    const cards = getCardCommittedInPeriod(s.creditCards ?? [], s.creditCardPurchases ?? [], s.creditCardInvoicePayments ?? [], t, addDaysIso(t, 30))
    committed = bills + cards
    freeMoney = total - committed - virtualReserves
  }

  // gasto de hoje (discricionário + essencial, sem reserved) — calculado antes para ajustar freeMoney
  const spentToday = s.transactions
    .filter(tx => !tx.deletedAt && tx.type === 'expense' && tx.date === t)
    .filter(tx => classifyTransaction(tx) !== 'reserved')
    .reduce((sum, tx) => sum + tx.amountCents, 0)

  // freeMoney inclui o gasto de hoje já descontado do total; para distribuir o dia de hoje, devolve o gasto não-reservado
  const totalBeforeTodaySpends = total + spentToday
  const freeMoneyBeforeToday = totalBeforeTodaySpends - committed - virtualReserves

  const baseForReserve = hasNextIncome ? freeMoneyBeforeToday : freeMoney
  const safetyReserve = hasNextIncome && baseForReserve > 0 ? Math.round(baseForReserve * margin) : 0
  const distributable = Math.max(0, (hasNextIncome ? baseForReserve : freeMoney) - safetyReserve)

  let safeDaily: number | null = null
  if (hasNextIncome && days && days > 0) {
    safeDaily = baseForReserve <= 0 ? 0 : Math.floor(distributable / days)
  } else if (!hasNextIncome) {
    // estimativa mensal se sem renda: distribui em 30
    safeDaily = null
  }

  let remaining: number | null = null
  let percent: number | null = null
  let status: SafeDailyResult['status'] = 'normal'

  if (!hasNextIncome) {
    status = 'no_income'
  } else if (freeMoney < 0) {
    status = 'negative_free'
    remaining = safeDaily !== null ? safeDaily - spentToday : null
  } else if (safeDaily === null) {
    status = 'no_income'
  } else {
    remaining = safeDaily - spentToday
    percent = safeDaily > 0 ? Math.round((spentToday / safeDaily) * 100) : (spentToday > 0 ? 100 : 0)
    if (remaining < 0) status = 'over'
    else if (remaining === 0) status = 'reached'
    else if (percent !== null && percent >= 80) status = 'near_limit'
    else status = 'normal'
  }

  // próxima conta (próximo vencimento não pago)
  let nextBill: SafeDailyResult['nextBill'] = null
  try {
    const active = s.recurringExpenses.filter(r => r.isActive)
    let best: { r: any; date: string } | null = null
    for (const r of active) {
      const occ = getUnrecordedOccurrencesBetween(r as any, t, addDaysIso(t, 60), s.transactions)[0]
      if (!occ) continue
      if (!best || occ < best.date) best = { r, date: occ }
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
  const spentAfter = base.spentTodayInCents + amountInCents
  // remaining not used in simulate, but we show
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

// ─── Prioridades configuráveis ───
const DEFAULT_PRIORITY: import('../domain').AllocationPriority[] = ['overdue','essential','bills','food','transport','goals','reserve','leisure','free']

export function getEffectivePriority(data?: FinanceData): import('../domain').AllocationPriority[] {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  return (s as any).paymentAllocationPriority ?? DEFAULT_PRIORITY
}

function getAlreadyReservedBillIds(data: FinanceData): Set<string> {
  const plans = (data as any).paymentAllocationPlans ?? []
  const ids = new Set<string>()
  for (const p of plans) {
    if (p.status !== 'applied') continue
    for (const it of p.items) {
      if (it.isConsumed) continue
      if (it.recurringExpenseId) ids.add(it.recurringExpenseId)
    }
  }
  return ids
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
  const alreadyReserved = getAlreadyReservedBillIds(s)
  const priority = getEffectivePriority(s)
  const has = (p: import('../domain').AllocationPriority) => priority.includes(p)

  // Helper to check if we should skip bills já reservados (evita duplicar reserva virtual)
  const isAlreadyReserved = (id: string) => alreadyReserved.has(id)

  // 1. Contas vencidas (overdue)
  if (has('overdue')) {
    const overdue = s.recurringExpenses.filter(r => r.isActive && !isAlreadyReserved(r.id)).flatMap(r => {
      const dates = getUnrecordedOccurrencesBetween(r as any, r.startDate, addDaysIso(t, -1), s.transactions)
      return dates.map(date => ({ r, date }))
    }).sort((a, b) => a.date.localeCompare(b.date))
    for (const { r } of overdue) addItem(r.name, 'bill', r.amountInCents, { recurringExpenseId: r.id, categoryId: r.category })
  }
  // 2-3. Obrigações recorrentes próximas (essential + bills)
  if (has('essential') || has('bills')) {
    const upcoming = s.recurringExpenses.filter(r => r.isActive && !isAlreadyReserved(r.id)).flatMap(r => {
      const occ = getUnrecordedOccurrencesBetween(r as any, t, periodEnd!, s.transactions)
      return occ.map(date => ({ r, date }))
    }).filter(({ r }) => !items.some(it => it.recurringExpenseId === r.id)).sort((a, b) => a.date.localeCompare(b.date))
    const seen = new Set<string>()
    for (const { r } of upcoming) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      if (items.some(it => it.recurringExpenseId === r.id)) continue
      // se for essencial, prioriza; senão bills normais
      addItem(r.name, 'bill', r.amountInCents, { recurringExpenseId: r.id, categoryId: r.category })
    }
  }
  // 4. Alimentação
  if (has('food')) {
    const month = t.slice(0, 7)
    const foodBudget = s.budgets.find(b => b.category === 'Alimentação' && b.month === month)
    // se preferência explícita existe, respeita (ex.: 600 reais fixo)
    const prefFood = (s as any).paymentAllocationPreferences?.find((p:any)=> p.rule?.toLowerCase().includes('alimenta'))
    let foodAmount = foodBudget ? foodBudget.limitCents : 60000
    if (prefFood) {
      // tenta extrair valor da regra se houver — fallback mantém budget
      const m = prefFood.rule.match(/R\$\s*([\d\.,]+)/)
      if (m) { const cents = Math.round(Number(m[1].replace(/\./g,'').replace(',','.'))*100); if (cents>0) foodAmount = cents }
    }
    addItem('Alimentação', 'budget', foodAmount, { categoryId: 'Alimentação' })
  }
  // 5. Transporte
  if (has('transport')) {
    const month = t.slice(0, 7)
    const transpBudget = s.budgets.find(b => b.category === 'Transporte' && b.month === month)
    const transpAmount = transpBudget ? transpBudget.limitCents : 30000
    addItem('Transporte', 'budget', transpAmount, { categoryId: 'Transporte' })
  }
  // 6. Metas prioritárias + Reserva
  if (has('goals') || has('reserve')) {
    const goals = (s.goals ?? []).slice(0, 2)
    if (goals.length && has('goals')) {
      for (const g of goals) {
        const need = Math.max(0, g.targetAmountInCents - g.currentAmountInCents)
        // preferência "guarda 10%" já é padrão 11%; se houver regra de percent reserva, usa
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
    } else if (!goals.length && !has('reserve') && has('goals')) {
      // fallback se reserve desabilitado mas sem metas
    }
  }
  // 7. Margem de segurança (safety)
  if (has('reserve') || has('free')) {
    // margem sempre antes de livre, respeitando safetyMarginPercent
    addItem('Margem de segurança', 'safety', safetyAmount)
  }
  // 8. Lazer (se houver orçamento e prioridade leisure habilitada)
  if (has('leisure')) {
    const month = t.slice(0, 7)
    const leisureBudget = s.budgets.find(b => b.category === 'Lazer' && b.month === month)
    if (leisureBudget) addItem('Lazer', 'budget', leisureBudget.limitCents, { categoryId: 'Lazer' })
  }
  // 9. Livre é o restante (pode ser negativo para indicar déficit)
  const totalAllocated = items.reduce((sum, it) => sum + it.amountInCents, 0)
  const freeAmount = received - totalAllocated
  const freeItem = Math.max(0, freeAmount)
  items.push({ id: uid(), label: 'Livre', type: 'free', amountInCents: freeItem })
  const plan: PaymentAllocationPlan = {
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
  return plan
}
