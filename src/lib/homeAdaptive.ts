import type { FinanceData } from '../domain'
import { currentMonth, today } from '../domain'
import { getUnrecordedOccurrencesBetween } from '../recurring'

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return date.toISOString().slice(0, 10)
}

function daysInMonthFrom(dateStr: string): number {
  const y = Number(dateStr.slice(0, 4))
  const m = Number(dateStr.slice(5, 7))
  return new Date(y, m, 0).getDate()
}

/**
 * Sugestões adaptativas — 3 cards máximos.
 * Regras:
 * - Início do mês (1-7) + recebeu há poucos dias → pagamento/organizar + dinheiro livre
 * - Final do mês (24-fim) → diário + livre + previsão (perigo)
 * - Orçamento estourado → prioriza orçamento
 * - Recorrências atrasadas → prioriza recorrentes
 * - Meio do mês → diário + gráfico + recorrentes
 */
export function getAdaptiveSuggestionIds(data: FinanceData, referenceDate = today()): string[] {
  const day = Number(referenceDate.slice(8, 10))
  const totalDays = daysInMonthFrom(referenceDate)
  const isEarly = day <= 7
  const isLate = day >= 24
  const isMid = !isEarly && !isLate
  const live = data.transactions.filter(t => !t.deletedAt)
  const month = referenceDate.slice(0, 7)
  const currentMonthStr = currentMonth()

  // 1) Atrasadas
  let overdueCount = 0
  try {
    for (const exp of data.recurringExpenses.filter(r => r.isActive)) {
      const overdue = getUnrecordedOccurrencesBetween(exp, exp.startDate, addDays(referenceDate, -1), data.transactions)
      if (overdue.length) overdueCount++
    }
  } catch {}

  // 2) Orçamento estourado no mês atual
  let budgetExceeded = false
  try {
    for (const b of data.budgets.filter(b => b.month === month)) {
      const spent = live.filter(t => t.type === 'expense' && t.category === b.category && t.date.startsWith(month)).reduce((s, t) => s + t.amountCents, 0)
      if (spent > b.limitCents) { budgetExceeded = true; break }
    }
    // se não tem orçamento no mês atual, verifica mês corrente para fallback
    if (!budgetExceeded && month !== currentMonthStr) {
      for (const b of data.budgets.filter(b => b.month === currentMonthStr)) {
        const spent = live.filter(t => t.type === 'expense' && t.category === b.category && t.date.startsWith(currentMonthStr)).reduce((s, t) => s + t.amountCents, 0)
        if (spent > b.limitCents) { budgetExceeded = true; break }
      }
    }
  } catch {}

  // 3) Tem pagamento recente (últimos 5 dias) — indica início de ciclo
  const hasRecentIncome = live.some(t => t.type === 'income' && t.date >= addDays(referenceDate, -5) && t.date <= referenceDate)

  // 4) Verifica se há recorrentes ativos — se não houver, não prioriza recorrentes
  const hasActiveRecurring = data.recurringExpenses.some(r => r.isActive)

  // Construção por prioridade
  const ids: string[] = []

  const push = (id: string) => { if (!ids.includes(id)) ids.push(id) }

  if (overdueCount > 0) push('recurring')
  if (budgetExceeded) push('budget')

  if (isEarly) {
    if (hasRecentIncome) push('payment')
    push('dailySpend')
    push('freeMoney')
    if (overdueCount === 0) push('recurring')
  } else if (isLate) {
    push('dailySpend')
    push('freeMoney')
    // fim de mês é complicado — mostra previsão
    push('forecast')
    if (overdueCount > 0 || hasActiveRecurring) push('recurring')
    // se ainda tem espaço, gráfico de controle
    if (ids.length < 3) push('chart')
  } else if (isMid) {
    push('dailySpend')
    if (hasActiveRecurring) push('recurring')
    push('chart')
    if (!budgetExceeded) push('budget')
  }

  // Fallback genérico se ainda vazio ou poucas
  if (ids.length < 2) {
    push('dailySpend')
    push('freeMoney')
    push('recurring')
  }

  // Garante pelo menos 3, corta para 3 e remove duplicatas mantendo ordem
  // Prioriza heterogeneidade: evita 3 do mesmo tipo
  const unique = [...new Set(ids)].slice(0, 3)

  // Se por algum motivo ainda não tem 3, completa com ordem padrão
  const fallbacks = ['dailySpend', 'freeMoney', 'recurring', 'chart', 'budget', 'forecast', 'payment', 'recent']
  for (const f of fallbacks) {
    if (unique.length >= 3) break
    if (!unique.includes(f)) unique.push(f)
  }

  // Se usuário não tem recorrentes, evita sugerir recorrentes
  if (!hasActiveRecurring) {
    const filtered = unique.filter(id => id !== 'recurring')
    while (filtered.length < 3) {
      for (const f of fallbacks) if (!filtered.includes(f) && f !== 'recurring') { filtered.push(f); if (filtered.length >=3) break }
      break
    }
    return filtered.slice(0, 3)
  }

  // Dica: quanto mais perto do fim, mais peso para forecast/freeMoney
  // Ajuste fino: se estamos nos últimos 3 dias, garante forecast
  if (day >= totalDays - 2 && !unique.includes('forecast')) {
    unique[2] = 'forecast'
  }

  return unique.slice(0, 3)
}
