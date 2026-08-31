import type { FinanceData } from './domain'
import { money } from './domain'
import { getFinanceNotifications, type FinanceNotification } from './notifications'
import { calculateForecast, summarizeForecast } from './forecast/calculate'
import { accountBalance, today } from './domain'
import { generateInvoicesForCard, getCardSummary } from './creditCards/creditCardService'

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
 * Após remoção do módulo de IA, mantém apenas regras 100% determinísticas
 * sem dependência de `ai/services/financialEngine`:
 * - base: overdue, reminder, budget-warning/exceeded
 * - previsão de saldo negativo (forecast)
 * - aumento em despesa recorrente variável
 * - meta atrasada
 * - oportunidade para metas (simplificada, sem financialEngine)
 */
export function getAllNotifications(input: ExtendedNotificationInput): FinanceNotification[] {
  const referenceDate = input.referenceDate ?? today()
  const data = input.data

  // 1) Regras base (compatível com getFinanceNotifications)
  const base = getFinanceNotifications({
    recurringExpenses: data.recurringExpenses,
    transactions: data.transactions,
    budgets: data.budgets,
    referenceDate,
  })

  const extended: FinanceNotification[] = []

  // 2) Previsão de saldo negativo (30 dias)
  try {
    const forecastPoints = calculateForecast({
      accounts: data.accounts,
      transactions: data.transactions,
      recurringExpenses: data.recurringExpenses,
      startDate: referenceDate,
      days: 30,
      realistic: (data as unknown as { forecastRealistic?: boolean }).forecastRealistic ?? true,
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
  } catch {
    // ignora erro determinístico
  }

  // 3) Aumento em despesa recorrente variável
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
  } catch {
    // ignora
  }

  // 4) Meta financeira atrasada
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
  } catch {
    // ignora
  }

  // 5) Cartões de crédito
  try {
    const cards = (data as any).creditCards ?? []
    const purchases = (data as any).creditCardPurchases ?? []
    const payments = (data as any).creditCardInvoicePayments ?? []
    for (const card of cards) {
      if (card.archived) continue
      const invoices = generateInvoicesForCard(card, purchases, payments, referenceDate, 3, 6)
      const summary = getCardSummary(card, purchases, payments, referenceDate)
      const pct = card.limitCents ? (summary.usedCents / card.limitCents) * 100 : 0

      // fatura próxima do fechamento (3 dias)
      const nextClosing = invoices.find(inv => inv.closingDate >= referenceDate && inv.totalCents > 0)
      if (nextClosing) {
        const diffClose = Math.round((new Date(`${nextClosing.closingDate}T12:00:00`).getTime() - new Date(`${referenceDate}T12:00:00`).getTime()) / 86_400_000)
        if (diffClose >= 0 && diffClose <= 3 && nextClosing.status === 'open') {
          extended.push({
            id: `card-closing-soon:${card.id}:${nextClosing.closingDate}`,
            kind: 'card-closing-soon',
            title: `Fatura do ${card.name} fecha em ${diffClose === 0 ? 'hoje' : `${diffClose}d`}`,
            message: `Fechamento em ${formatDate(nextClosing.closingDate)} • ${money(nextClosing.totalCents)}`,
            date: nextClosing.closingDate,
            href: '/cards',
          })
        }
        const diffDue = Math.round((new Date(`${nextClosing.dueDate}T12:00:00`).getTime() - new Date(`${referenceDate}T12:00:00`).getTime()) / 86_400_000)
        if (diffDue >= 0 && diffDue <= 3 && nextClosing.remainingCents > 0) {
          extended.push({
            id: `card-due-soon:${card.id}:${nextClosing.dueDate}`,
            kind: 'card-due-soon',
            title: `Fatura do ${card.name} vence em ${diffDue === 0 ? 'hoje' : `${diffDue}d`}`,
            message: `Vencimento ${formatDate(nextClosing.dueDate)} • ${money(nextClosing.remainingCents)}`,
            date: nextClosing.dueDate,
            href: '/cards',
          })
        }
      }

      // faturas vencidas / atrasadas
      for (const inv of invoices) {
        if (inv.status === 'overdue') {
          extended.push({
            id: `card-overdue:${card.id}:${inv.closingDate}`,
            kind: 'card-overdue',
            title: `Fatura atrasada • ${card.name}`,
            message: `Venceu em ${formatDate(inv.dueDate)} • ${money(inv.remainingCents)} em aberto`,
            date: inv.dueDate,
            href: '/cards',
          })
          break
        }
      }

      // limite
      if (pct >= 98) {
        extended.push({
          id: `card-limit-exhausted:${card.id}:${referenceDate.slice(0, 7)}`,
          kind: 'card-limit-exhausted',
          title: `${card.name} sem limite`,
          message: `Limite praticamente esgotado: ${pct.toFixed(0)}% usado`,
          date: referenceDate,
          href: '/cards',
        })
      } else if (pct >= 90) {
        extended.push({
          id: `card-limit-critical:${card.id}:${referenceDate.slice(0, 7)}`,
          kind: 'card-limit-critical',
          title: `${card.name} acima de 90% do limite`,
          message: `${pct.toFixed(0)}% do limite utilizado • ${money(summary.availableCents)} disponível`,
          date: referenceDate,
          href: '/cards',
        })
      } else if (pct >= 70) {
        extended.push({
          id: `card-limit-warning:${card.id}:${referenceDate.slice(0, 7)}`,
          kind: 'card-limit-warning',
          title: `${card.name} acima de 70% do limite`,
          message: `${pct.toFixed(0)}% usado • ${money(summary.availableCents)} disponível`,
          date: referenceDate,
          href: '/cards',
        })
      }

      // aumento incomum da fatura (compara com média 3 meses)
      const recentTotals = invoices.filter(inv => inv.totalCents > 0).sort((a, b) => b.closingDate.localeCompare(a.closingDate)).slice(0, 4)
      if (recentTotals.length >= 4) {
        const current = recentTotals[0].totalCents
        const avg = Math.round(recentTotals.slice(1, 4).reduce((s, inv) => s + inv.totalCents, 0) / 3)
        if (avg > 0 && current > avg * 1.3 && current - avg > 5000) {
          extended.push({
            id: `card-invoice-increase:${card.id}:${referenceDate.slice(0, 7)}`,
            kind: 'card-invoice-increase',
            title: `Fatura do ${card.name} acima da média`,
            message: `${money(current)} vs média ${money(avg)}`,
            date: referenceDate,
            href: '/cards',
          })
        }
      }

      // parcela próxima do fim (última parcela)
      for (const p of purchases.filter((pr: any) => pr.cardId === card.id && pr.status === 'active' && pr.installments > 1)) {
        const insts = generateInvoicesForCard(card, [p], payments, referenceDate, 12, 12)
        // simplifica: se só resta 1 parcela futura
        const futureCount = (p as any).installments - 1 // aproximado; melhor calcular via service
        // usa helper para contar restantes
        const remaining = (() => {
          try {
            const all = generateInvoicesForCard(card, [p], payments, referenceDate, 0, 12)
            return all.filter(inv => inv.closingDate >= referenceDate && inv.totalCents > 0).length
          } catch { return 0 }
        })()
        if (remaining === 1) {
          extended.push({
            id: `card-installment-ending:${p.id}:${referenceDate.slice(0, 7)}`,
            kind: 'card-installment-ending',
            title: `Última parcela: ${p.description}`,
            message: `${p.installments}x terminando • ${money(p.totalAmountCents)} total`,
            date: referenceDate,
            href: '/cards',
          })
          break
        }
        if (futureCount === 1) break
      }

      // pagamento parcial pendente
      const partially = invoices.find(inv => inv.status === 'partially_paid')
      if (partially) {
        extended.push({
          id: `card-partially-paid:${card.id}:${partially.closingDate}`,
          kind: 'card-partially-paid',
          title: `Pagamento parcial • ${card.name}`,
          message: `Falta ${money(partially.remainingCents)} de ${money(partially.totalCents)}`,
          date: partially.dueDate,
          href: '/cards',
        })
      }
    }
  } catch {
    // ignora
  }

  // Merge + ordenação determinística por severidade
  const all = [...base, ...extended]
  const weight = (item: FinanceNotification) => {
    if (item.kind === 'overdue' || item.kind === 'goal-overdue' || item.kind === 'card-overdue' || item.kind === 'card-limit-exhausted') return 0
    if (item.kind === 'forecast-negative' || item.kind === 'budget-exceeded' || item.kind === 'free-money-drop' || item.kind === 'card-limit-critical' || item.kind === 'card-partially-paid') return 1
    if (item.kind === 'budget-warning' || item.kind === 'daily-overspent' || item.kind === 'card-limit-warning' || item.kind === 'card-due-soon' || item.kind === 'card-closing-soon') return 2
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
