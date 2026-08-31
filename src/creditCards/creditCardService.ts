import type { CreditCard, CreditCardInvoice, CreditCardInvoicePayment, CreditCardPurchase, FinanceData } from '../domain'
import { today } from '../domain'

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function toIso(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

export function closingDateForMonth(year: number, monthIndex: number, closingDay: number): string {
  const clamped = Math.min(Math.max(1, closingDay), lastDayOfMonth(year, monthIndex))
  return toIso(year, monthIndex, clamped)
}

export function dueDateFromClosing(closingIso: string, dueDay: number): string {
  const closing = new Date(`${closingIso}T12:00:00`)
  const closingDay = closing.getDate()
  const dueClampedDay = Math.max(1, Math.min(31, dueDay))
  let dueYear = closing.getFullYear()
  let dueMonth = closing.getMonth()
  // se vencimento <= fechamento, vence no mês seguinte
  if (dueClampedDay <= closingDay) {
    dueMonth += 1
    if (dueMonth > 11) {
      dueMonth = 0
      dueYear += 1
    }
  }
  const clamped = Math.min(dueClampedDay, lastDayOfMonth(dueYear, dueMonth))
  return toIso(dueYear, dueMonth, clamped)
}

export function addMonthsIso(dateIso: string, months: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  const year = d.getFullYear()
  const month = d.getMonth() + months
  const day = d.getDate()
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const clamped = Math.min(day, lastDayOfMonth(targetYear, targetMonth))
  return toIso(targetYear, targetMonth, clamped)
}

export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return toIso(d.getFullYear(), d.getMonth(), d.getDate())
}

function compareIso(a: string, b: string): number {
  return a.localeCompare(b)
}

export function getNextClosingDate(card: CreditCard, purchaseDate: string): string {
  const purchase = new Date(`${purchaseDate}T12:00:00`)
  const year = purchase.getFullYear()
  const month = purchase.getMonth()
  const closingThisMonth = closingDateForMonth(year, month, card.closingDay)
  if (compareIso(purchaseDate, closingThisMonth) <= 0) return closingThisMonth
  // próximo mês
  const nextYear = month === 11 ? year + 1 : year
  const nextMonth = month === 11 ? 0 : month + 1
  return closingDateForMonth(nextYear, nextMonth, card.closingDay)
}

export function getInstallmentClosingDates(card: CreditCard, purchaseDate: string, installments: number): string[] {
  const first = getNextClosingDate(card, purchaseDate)
  const dates: string[] = []
  for (let i = 0; i < installments; i += 1) {
    dates.push(addMonthsIso(first, i))
  }
  return dates
}

export function getInstallmentAmount(totalCents: number, installments: number, index: number): number {
  const base = Math.floor(totalCents / installments)
  const remainder = totalCents % installments
  // distribui 1 centavo por parcela nas primeiras 'remainder' parcelas
  return base + (index < remainder ? 1 : 0)
}

export interface PurchaseInstallment {
  purchaseId: string
  cardId: string
  installmentNumber: number
  totalInstallments: number
  amountCents: number
  closingDate: string
  dueDate: string
  purchaseDescription: string
  category: string
  purchaseDate: string
}

export function getPurchaseInstallments(purchase: CreditCardPurchase, card: CreditCard): PurchaseInstallment[] {
  const closingDates = getInstallmentClosingDates(card, purchase.purchaseDate, purchase.installments)
  return closingDates.map((closingDate, idx) => ({
    purchaseId: purchase.id,
    cardId: card.id,
    installmentNumber: idx + 1,
    totalInstallments: purchase.installments,
    amountCents: getInstallmentAmount(purchase.totalAmountCents, purchase.installments, idx),
    closingDate,
    dueDate: dueDateFromClosing(closingDate, card.dueDay),
    purchaseDescription: purchase.description,
    category: purchase.category,
    purchaseDate: purchase.purchaseDate,
  }))
}

export function getAllPurchaseInstallments(purchases: CreditCardPurchase[], cards: CreditCard[]): PurchaseInstallment[] {
  const cardMap = new Map(cards.map(c => [c.id, c]))
  const result: PurchaseInstallment[] = []
  for (const p of purchases) {
    if (p.status !== 'active') continue
    const card = cardMap.get(p.cardId)
    if (!card || card.archived) continue
    result.push(...getPurchaseInstallments(p, card))
  }
  return result
}

export function previousClosingDate(card: CreditCard, closingIso: string): string {
  // closing anterior = closing atual menos 1 mês, mas com mesmo dia corrigido
  const d = new Date(`${closingIso}T12:00:00`)
  const year = d.getFullYear()
  const month = d.getMonth() - 1
  const targetYear = month < 0 ? year - 1 : year
  const targetMonth = month < 0 ? 11 : month
  return closingDateForMonth(targetYear, targetMonth, card.closingDay)
}

export function getInvoicePeriod(card: CreditCard, closingIso: string): { start: string; end: string } {
  const prev = previousClosingDate(card, closingIso)
  const start = addDaysIso(prev, 1)
  return { start, end: closingIso }
}

export function getInvoiceStatus(params: {
  closingDate: string
  dueDate: string
  totalCents: number
  paidCents: number
  referenceDate: string
}): CreditCardInvoice['status'] {
  const { closingDate, dueDate, totalCents, paidCents, referenceDate } = params
  const remaining = totalCents - paidCents
  if (totalCents === 0) {
    // fatura vazia: considerada paga se já fechou, aberta se ainda não
    return compareIso(referenceDate, closingDate) <= 0 ? 'open' : 'paid'
  }
  if (remaining <= 0) return 'paid'
  if (compareIso(referenceDate, dueDate) > 0) return 'overdue'
  if (paidCents > 0) return 'partially_paid'
  if (compareIso(referenceDate, closingDate) > 0) return 'closed'
  return 'open'
}

export function generateInvoicesForCard(
  card: CreditCard,
  purchases: CreditCardPurchase[],
  payments: CreditCardInvoicePayment[],
  referenceDate: string = today(),
  monthsBack = 6,
  monthsAhead = 12
): CreditCardInvoice[] {
  const relevantPurchases = purchases.filter(p => p.cardId === card.id && p.status === 'active')
  const allInstallments = relevantPurchases.flatMap(p => getPurchaseInstallments(p, card))

  // agrupa por closingDate
  const byClosing = new Map<string, PurchaseInstallment[]>()
  for (const inst of allInstallments) {
    const list = byClosing.get(inst.closingDate) ?? []
    list.push(inst)
    byClosing.set(inst.closingDate, list)
  }

  // determina janela de faturas: cobre de referência - monthsBack a referência + monthsAhead
  // mais qualquer closing que tenha parcela fora da janela (para não perder parcelas antigas/futuras distantes)
  const ref = new Date(`${referenceDate}T12:00:00`)
  const startWindow = new Date(ref)
  startWindow.setMonth(startWindow.getMonth() - monthsBack)
  const endWindow = new Date(ref)
  endWindow.setMonth(endWindow.getMonth() + monthsAhead)

  // inclui closings com parcelas fora da janela
  const allClosingSet = new Set<string>(byClosing.keys())
  // gera todas as closings na janela mesmo sem parcelas
  const cursor = new Date(startWindow.getFullYear(), startWindow.getMonth(), 1, 12)
  const end = new Date(endWindow.getFullYear(), endWindow.getMonth(), 1, 12)
  for (let d = new Date(cursor); d <= end; d.setMonth(d.getMonth() + 1)) {
    const closing = closingDateForMonth(d.getFullYear(), d.getMonth(), card.closingDay)
    allClosingSet.add(closing)
  }

  const closings = Array.from(allClosingSet).sort()

  // map payments por closing
  const paidByClosing = new Map<string, number>()
  for (const pay of payments) {
    if (pay.cardId !== card.id) continue
    const sum = paidByClosing.get(pay.invoiceClosingDate) ?? 0
    paidByClosing.set(pay.invoiceClosingDate, sum + pay.amountCents)
  }

  const invoices: CreditCardInvoice[] = []
  for (const closing of closings) {
    const due = dueDateFromClosing(closing, card.dueDay)
    const period = getInvoicePeriod(card, closing)
    const installmentsRaw = byClosing.get(closing) ?? []
    // instala ordenado por data de compra e parcela
    installmentsRaw.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.installmentNumber - b.installmentNumber)
    const total = installmentsRaw.reduce((sum, inst) => sum + inst.amountCents, 0)
    const paid = paidByClosing.get(closing) ?? 0
    const remaining = Math.max(0, total - paid)
    const status = getInvoiceStatus({ closingDate: closing, dueDate: due, totalCents: total, paidCents: paid, referenceDate })
    // mapeia para formato da invoice
    const installmentsForInvoice = installmentsRaw.map(inst => ({
      purchaseId: inst.purchaseId,
      cardId: inst.cardId,
      installmentNumber: inst.installmentNumber,
      totalInstallments: inst.totalInstallments,
      amountCents: inst.amountCents,
      purchaseDescription: inst.purchaseDescription,
      category: inst.category,
      purchaseDate: inst.purchaseDate,
    }))
    invoices.push({
      id: `${card.id}:${closing}`,
      cardId: card.id,
      closingDate: closing,
      dueDate: due,
      periodStart: period.start,
      periodEnd: period.end,
      status,
      totalCents: total,
      paidCents: paid,
      remainingCents: remaining,
      installments: installmentsForInvoice,
    })
  }

  // ordena por closing
  invoices.sort((a, b) => a.closingDate.localeCompare(b.closingDate))
  return invoices
}

export function getCurrentInvoice(
  card: CreditCard,
  purchases: CreditCardPurchase[],
  payments: CreditCardInvoicePayment[],
  referenceDate: string = today()
): CreditCardInvoice | undefined {
  const invoices = generateInvoicesForCard(card, purchases, payments, referenceDate, 1, 6)
  // fatura atual = próxima closing >= referenceDate
  const upcoming = invoices.filter(inv => compareIso(inv.closingDate, referenceDate) >= 0).sort((a, b) => a.closingDate.localeCompare(b.closingDate))
  return upcoming[0] ?? invoices[invoices.length - 1]
}

export function getCardSummary(
  card: CreditCard,
  purchases: CreditCardPurchase[],
  payments: CreditCardInvoicePayment[],
  referenceDate: string = today()
) {
  const invoices = generateInvoicesForCard(card, purchases, payments, referenceDate, 12, 12)
  const current = getCurrentInvoice(card, purchases, payments, referenceDate)
  const totalUsed = invoices.reduce((sum, inv) => sum + inv.remainingCents, 0)
  // alternativo: soma de todas parcelas não pagas (mesmo de faturas passadas overdue)
  // já é remaining
  const available = Math.max(0, card.limitCents - totalUsed)
  const currentTotal = current?.totalCents ?? 0
  const currentPaid = current?.paidCents ?? 0
  const currentRemaining = current?.remainingCents ?? 0

  // próximas faturas (exclui a atual, pega 4 seguintes)
  const upcoming = invoices
    .filter(inv => current && compareIso(inv.closingDate, current.closingDate) > 0)
    .slice(0, 4)

  // compras recentes (últimas 5 ativas)
  const recentPurchases = purchases
    .filter(p => p.cardId === card.id && p.status === 'active')
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)

  // parceladas em andamento: compras com installments>1 e ainda tem parcelas futuras não pagas (closing >= reference)
  const installmentsInProgress = purchases.filter(p => {
    if (p.cardId !== card.id || p.status !== 'active' || p.installments <= 1) return false
    const insts = getPurchaseInstallments(p, card)
    return insts.some(inst => compareIso(inst.closingDate, referenceDate) >= 0)
  }).length

  return {
    limitCents: card.limitCents,
    usedCents: totalUsed,
    availableCents: available,
    currentInvoice: current,
    currentTotalCents: currentTotal,
    currentPaidCents: currentPaid,
    currentRemainingCents: currentRemaining,
    upcomingInvoices: upcoming,
    recentPurchases,
    installmentsInProgress,
    allInvoices: invoices,
  }
}

export function getAllUpcomingInvoices(
  cards: CreditCard[],
  purchases: CreditCardPurchase[],
  payments: CreditCardInvoicePayment[],
  referenceDate: string = today(),
  countPerCard = 4
): Array<{ card: CreditCard; invoice: CreditCardInvoice }> {
  const result: Array<{ card: CreditCard; invoice: CreditCardInvoice }> = []
  for (const card of cards) {
    if (card.archived) continue
    const summary = getCardSummary(card, purchases, payments, referenceDate)
    for (const inv of summary.upcomingInvoices.slice(0, countPerCard)) {
      result.push({ card, invoice: inv })
    }
  }
  result.sort((a, b) => a.invoice.closingDate.localeCompare(b.invoice.closingDate))
  return result
}

export function getCardCommittedInPeriod(
  cards: CreditCard[],
  purchases: CreditCardPurchase[],
  payments: CreditCardInvoicePayment[],
  start: string,
  end: string
): number {
  // soma dos totais de faturas (remaining) cujo closingDate está no período
  let total = 0
  for (const card of cards) {
    if (card.archived) continue
    const invoices = generateInvoicesForCard(card, purchases, payments, start, 0, 24)
    for (const inv of invoices) {
      if (compareIso(inv.closingDate, start) >= 0 && compareIso(inv.closingDate, end) <= 0) {
        total += inv.remainingCents
      }
    }
  }
  return total
}

export function getCardSpendingByCategory(
  cards: CreditCard[],
  purchases: CreditCardPurchase[],
  start: string,
  end: string
): Map<string, number> {
  const map = new Map<string, number>()
  const installments = getAllPurchaseInstallments(purchases, cards)
  for (const inst of installments) {
    if (compareIso(inst.closingDate, start) < 0 || compareIso(inst.closingDate, end) > 0) continue
    const prev = map.get(inst.category) ?? 0
    map.set(inst.category, prev + inst.amountCents)
  }
  return map
}

export function getCardsTotalUsed(cards: CreditCard[], purchases: CreditCardPurchase[], payments: CreditCardInvoicePayment[]): number {
  let total = 0
  for (const card of cards) {
    if (card.archived) continue
    const summary = getCardSummary(card, purchases, payments, today())
    total += summary.usedCents
  }
  return total
}

export function formatInvoiceMonth(closingIso: string): string {
  const d = new Date(`${closingIso}T12:00:00`)
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(d)
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1)
  return capitalized
}

export function getOutstandingInstallmentsForPurchase(
  purchase: CreditCardPurchase,
  card: CreditCard,
  payments: CreditCardInvoicePayment[],
  referenceDate: string = today()
): number {
  const insts = getPurchaseInstallments(purchase, card)
  // conta parcelas cujo closing >= reference e ainda não pagas (invoice remaining >0)
  // simplificado: conta todas futuras
  return insts.filter(inst => compareIso(inst.closingDate, referenceDate) >= 0).length
}
