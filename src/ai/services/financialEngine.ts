import { accountBalance, money, today } from '../../domain'
import type { FinanceData } from '../../domain'
import { useFinanceStore } from '../../store'
import { calculateCommittedAmount, getUnrecordedOccurrencesBetween } from '../../recurring'
import { calculateForecast, getAverageDailyVariable, summarizeForecast } from '../../forecast/calculate'

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

export function calculateAvailableMoney(untilDate?: string, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const end = untilDate ?? addDaysIso(t, 30)
  const total = getTotalBalance(s)
  const committed = calculateCommittedAmount(s.recurringExpenses, t, end, s.transactions)
  const available = total - committed
  return { totalCents: total, committedCents: committed, availableCents: available, totalFormatted: money(total), committedFormatted: money(committed), availableFormatted: money(available), period: { start: t, end } }
}

export function calculateCommitted(start?: string, end?: string, data?: FinanceData) {
  const s = data ?? (useFinanceStore.getState() as unknown as FinanceData)
  const t = today()
  const startIso = start ?? t
  const endIso = end ?? addDaysIso(t, 30)
  const committed = calculateCommittedAmount(s.recurringExpenses, startIso, endIso, s.transactions)
  return { committedCents: committed, committedFormatted: money(committed), period: { start: startIso, end: endIso } }
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
    // reuse expense occurrence logic via RecurringExpense shape — income has same fields
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
  } else {
    const byMonth = new Map<string, number>()
    for (const t of filtered) { const m = t.date.slice(0,7); byMonth.set(m, (byMonth.get(m)??0)+t.amountCents) }
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
  return { days, realistic, points: points.slice(0, Math.min(points.length, 14)), summary: { endBalance: money(summary.endBalance), minBalance: money(summary.minBalance), totalRecurring: money(summary.totalRecurring), totalVariable: money(summary.totalVariable) }, avg: { expensePerDay: money(avg.avgExpense), incomePerDay: money(avg.avgIncome) } }
}

// ── Classificação de gastos ──
export type SpendClass = 'reserved' | 'essential' | 'discretionary'

const DISCRETIONARY_KEYWORDS = /(restaurante|lanchonete|bar|cinema|show|ingresso|lazer|jogo|pub|balada|ifood|delivery.*lazer)/i
const ESSENTIAL_CATEGORIES = new Set(['Alimentação', 'Saúde', 'Educação', 'Transporte'])
const RESERVED_CATEGORIES = new Set(['Moradia', 'Assinaturas'])

export function classifyTransaction(tx: import('../../domain').FinanceTransaction): SpendClass {
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

  if (hasNextIncome) {
    nextDate = nextIncome.nextDate!
    days = diffDays(t, nextDate)
    // se nextDate é hoje, days 0 -> trata como 1 (ainda hoje)
    if (days === 0) days = 1
    // comprometido até véspera do recebimento (não contar o dia do salário como gasto)
    const endForFree = addDaysIso(nextDate, -1)
    if (endForFree >= t) {
      committed = calculateCommittedAmount(s.recurringExpenses, t, endForFree, s.transactions)
    } else {
      committed = 0
    }
    freeMoney = total - committed
  } else {
    // sem próxima receita: usa 30 dias como estimativa mas marca hasNextIncome false
    days = null
    // free = total - committed próximos 30 dias (para exibir)
    committed = calculateCommittedAmount(s.recurringExpenses, t, addDaysIso(t, 30), s.transactions)
    freeMoney = total - committed
  }

  // gasto de hoje (discricionário + essencial, sem reserved) — calculado antes para ajustar freeMoney
  const spentToday = s.transactions
    .filter(tx => !tx.deletedAt && tx.type === 'expense' && tx.date === t)
    .filter(tx => classifyTransaction(tx) !== 'reserved')
    .reduce((sum, tx) => sum + tx.amountCents, 0)

  // freeMoney inclui o gasto de hoje já descontado do total; para distribuir o dia de hoje, devolve o gasto não-reservado
  const totalBeforeTodaySpends = total + spentToday
  const freeMoneyBeforeToday = totalBeforeTodaySpends - committed

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
