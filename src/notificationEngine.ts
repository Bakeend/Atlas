import type { FinanceData } from './domain'
import { money } from './domain'
import { getFinanceNotifications, type FinanceNotification } from './notifications'
import { calculateFreeMoney, calculateSafeDailySpend, detectAnomalies } from './ai/services/financialEngine'
import { calculateForecast, summarizeForecast } from './forecast/calculate'
import { accountBalance, today } from './domain'

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(`${value}T12:00:00`))
    .replace('.', '')
}

export interface ExtendedNotificationInput {
  data: FinanceData
  referenceDate?: string
}

/**
 * Motor determinístico central de notificações do Atlas.
 * Agrega as 4 regras originais (overdue, reminder, budget-warning/exceeded)
 * + regras futuras 100% determinísticas sem IA:
 * - gasto diário acima do recomendado
 * - previsão de saldo negativo
 * - gasto muito acima da média histórica
 * - aumento em despesa recorrente variável
 * - meta atrasada
 * - queda no dinheiro livre
 * - oportunidade para metas
 *
 * Todas as regras são puras, sem side-effects, sem chamadas de rede.
 */
export function getAllNotifications(input: ExtendedNotificationInput): FinanceNotification[] {
  const referenceDate = input.referenceDate ?? today()
  const data = input.data

  // 1) Regras base (mantém compatibilidade total com getFinanceNotifications)
  const base = getFinanceNotifications({
    recurringExpenses: data.recurringExpenses,
    transactions: data.transactions,
    budgets: data.budgets,
    referenceDate,
  })

  const extended: FinanceNotification[] = []

  // 2) Gasto diário acima do recomendado
  try {
    const safe = calculateSafeDailySpend(data, referenceDate)
    if (safe.status === 'over' && safe.safeDailySpendInCents !== null && safe.remainingTodayInCents !== null) {
      extended.push({
        id: `daily-overspent:${referenceDate}`,
        kind: 'daily-overspent',
        title: 'Gasto do dia acima do recomendado',
        message: `Você gastou ${money(safe.spentTodayInCents)} hoje, acima do limite de ${money(safe.safeDailySpendInCents)}. Excesso de ${money(Math.abs(safe.remainingTodayInCents))}.`,
        date: referenceDate,
        href: '/',
      })
    } else if (safe.status === 'negative_free') {
      extended.push({
        id: `free-money-drop:${referenceDate}:negative`,
        kind: 'free-money-drop',
        title: 'Dinheiro livre negativo',
        message: `Seu dinheiro livre está negativo. Ajuste seu planejamento para evitar saldo negativo.`,
        date: referenceDate,
        href: '/',
      })
    }
  } catch {
    // ignora erro determinístico
  }

  // 3) Previsão de saldo negativo (30 dias)
  try {
    const forecastPoints = calculateForecast({
      accounts: data.accounts,
      transactions: data.transactions,
      recurringExpenses: data.recurringExpenses,
      startDate: referenceDate,
      days: 30,
      realistic: (data as any).forecastRealistic ?? true,
    })
    const total = data.accounts.filter(a => !a.archived).reduce((s, acc) => s + accountBalance(acc, data.transactions.filter(t => !t.deletedAt)), 0)
    const summary = summarizeForecast(forecastPoints, total)
    if (summary.minBalance < 0) {
      const firstNegative = forecastPoints.find(p => p.balance < 0)
      const date = firstNegative?.date ?? addDaysIso(referenceDate, 7)
      extended.push({
        id: `forecast-negative:${date}`,
        kind: 'forecast-negative',
        title: 'Previsão de saldo negativo',
        message: `Seu saldo pode ficar negativo em ${formatDate(date)} (mínimo ${money(summary.minBalance)}).`,
        date,
        href: '/forecast',
      })
    }
  } catch {}

  // 4) Gasto muito acima da média histórica (anomalias)
  try {
    const anomalies = detectAnomalies(6, data)
    for (const anomaly of anomalies.slice(0, 2)) {
      // limita a 2 para não spammar
      const month = referenceDate.slice(0, 7)
      extended.push({
        id: `anomaly:${anomaly.category}:${month}`,
        kind: 'anomaly',
        title: `Gasto com ${anomaly.category} acima da média`,
        message: `${anomaly.currentFormatted} este mês, ${anomaly.deltaPercent}% acima da média de ${anomaly.averageFormatted}.`,
        date: referenceDate,
        href: '/transactions',
      })
    }
  } catch {}

  // 5) Aumento em despesa recorrente variável
  try {
    const t = referenceDate
    const start90 = addDaysIso(t, -90)
    const live = data.transactions.filter(tx => !tx.deletedAt && tx.type === 'expense' && tx.date >= start90 && tx.date <= t)
    for (const exp of data.recurringExpenses) {
      if (!exp.isActive || !exp.isVariable) continue
      const sameCat = live.filter(tx => tx.category === exp.category)
      if (sameCat.length < 2) continue
      const avg = Math.round(sameCat.reduce((s, tx) => s + tx.amountCents, 0) / sameCat.length)
      if (avg > exp.amountInCents * 1.15 && avg > exp.amountInCents + 1000) {
        // aumento >15% e > R$10
        extended.push({
          id: `recurring-increase:${exp.id}:${referenceDate.slice(0, 7)}`,
          kind: 'recurring-increase',
          title: `${exp.name} com valor acima do esperado`,
          message: `Média recente de ${money(avg)} acima de ${money(exp.amountInCents)} cadastrado.`,
          date: referenceDate,
          href: '/recurring',
        })
      }
    }
  } catch {}

  // 6) Meta financeira atrasada
  try {
    for (const goal of data.goals ?? []) {
      if (!goal.deadline) continue
      if (goal.deadline >= referenceDate) continue
      const remaining = Math.max(0, goal.targetAmountInCents - goal.currentAmountInCents)
      if (remaining <= 0) continue
      extended.push({
        id: `goal-overdue:${goal.id}:${goal.deadline}`,
        kind: 'goal-overdue',
        title: `Meta "${goal.title}" atrasada`,
        message: `Venceu em ${formatDate(goal.deadline)} e ainda faltam ${money(remaining)}.`,
        date: goal.deadline,
        href: '/organizar',
      })
    }
  } catch {}

  // 7) Queda significativa no dinheiro livre / oportunidade para metas
  try {
    const free = calculateFreeMoney({ period: 'next30', data })
    // Queda: livre negativo já coberto acima, mas se livre positivo porém < 50% do livre de 7 dias atrás (via localStorage snapshot)
    // Para engine pura, detecta livre muito baixo vs total: < 10% do total quando total > 0
    const total = free.totalCents
    if (total > 50000 && free.freeCents >= 0 && free.freeCents < total * 0.1 && !free.isInsufficientData) {
      extended.push({
        id: `free-money-drop:${referenceDate}:low`,
        kind: 'free-money-drop',
        title: 'Dinheiro livre em queda',
        message: `Seu dinheiro livre é de ${money(free.freeCents)}, menos de 10% do saldo total.`,
        date: referenceDate,
        href: '/',
      })
    }
    // Oportunidade: livre alto (>30% do total) e existe meta aberta
    const hasOpenGoal = (data.goals ?? []).some(g => g.targetAmountInCents > g.currentAmountInCents)
    if (hasOpenGoal && free.freeCents > 0 && total > 0 && free.freeCents > total * 0.3) {
      const target = (data.goals ?? []).find(g => g.targetAmountInCents > g.currentAmountInCents)
      if (target) {
        extended.push({
          id: `goal-opportunity:${referenceDate}:${target.id}`,
          kind: 'goal-opportunity',
          title: 'Oportunidade para reservar para metas',
          message: `Você tem ${money(free.freeCents)} livres — que tal reservar para "${target.title}"?`,
          date: referenceDate,
          href: '/organizar',
        })
      }
    }
  } catch {}

  // Merge + ordenação determinística por severidade
  const all = [...base, ...extended]
  const weight = (item: FinanceNotification) => {
    if (item.kind === 'overdue' || item.kind === 'goal-overdue') return 0
    if (item.kind === 'forecast-negative' || item.kind === 'budget-exceeded' || item.kind === 'free-money-drop') return 1
    if (item.kind === 'budget-warning' || item.kind === 'daily-overspent') return 2
    return 3
  }
  return all.sort((a, b) => weight(a) - weight(b) || a.date.localeCompare(b.date))
}

/**
 * Totais por severidade — útil para badge e resumo do sistema.
 */
export function summarizeNotifications(notifications: FinanceNotification[]) {
  const counts: Record<string, number> = {}
  for (const n of notifications) counts[n.kind] = (counts[n.kind] ?? 0) + 1
  return counts
}
