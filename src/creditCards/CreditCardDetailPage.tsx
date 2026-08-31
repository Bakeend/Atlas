import { ArrowLeft, ChevronDown, ChevronUp, CreditCard as CardIcon, Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Empty, PageTitle } from '../components'
import { money, today } from '../domain'
import { useFinanceStore } from '../store'
import { generateInvoicesForCard, getCardSummary } from './creditCardService'
import { PurchaseModal } from './PurchaseModal'
import { PaymentModal } from './PaymentModal'
import { CreditCardModal } from './CreditCardModal'

function statusLabel(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: 'Aberta', className: 'bg-slate-100 text-slate-700' },
    closed: { label: 'Fechada', className: 'bg-amber-100 text-amber-800' },
    partially_paid: { label: 'Parcialmente paga', className: 'bg-blue-100 text-blue-700' },
    paid: { label: 'Paga', className: 'bg-emerald-100 text-emerald-700' },
    overdue: { label: 'Atrasada', className: 'bg-red-100 text-red-700' },
  }
  return map[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' }
}

export function CreditCardDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { creditCards, creditCardPurchases, creditCardInvoicePayments, hideBalances, deleteCreditCardPurchase, cancelCreditCardPurchase, accounts } = useFinanceStore() as any
  const card = (creditCards ?? []).find((c: any) => c.id === id)
  const [showPurchase, setShowPurchase] = useState(false)
  const [editingCard, setEditingCard] = useState(false)
  const [paying, setPaying] = useState<string | null>(null)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [showAllPurchases, setShowAllPurchases] = useState(false)

  const purchases = (creditCardPurchases ?? []).filter((p: any) => p.cardId === id)
  const payments = (creditCardInvoicePayments ?? []).filter((p: any) => p.cardId === id)

  const summary = useMemo(() => card ? getCardSummary(card, creditCardPurchases ?? [], creditCardInvoicePayments ?? []) : null, [card, creditCardPurchases, creditCardInvoicePayments])
  const invoices = useMemo(() => card ? generateInvoicesForCard(card, creditCardPurchases ?? [], creditCardInvoicePayments ?? [], today(), 6, 6).sort((a, b) => b.closingDate.localeCompare(a.closingDate)) : [], [card, creditCardPurchases, creditCardInvoicePayments])

  if (!card) {
    return <><PageTitle eyebrow="Cartão" title="Não encontrado" backTo="/cards" /><Empty title="Cartão não encontrado" text="O cartão solicitado não existe ou foi removido." action={<button className="btn-primary" onClick={() => navigate('/cards')}>Voltar</button>} /></>
  }

  const pct = card.limitCents ? Math.round(((summary?.usedCents ?? 0) / card.limitCents) * 100) : 0
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand'
  const current = summary?.currentInvoice

  // próximas faturas compactas (visão solicitada)
  const upcomingCompact = summary?.upcomingInvoices ?? []

  return (
    <>
      <div className="page-title">
        <div>
          <button onClick={() => navigate('/cards')} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft size={17} />Cartões</button>
          <h1>{card.name}</h1>
          <span className="mt-1 block text-xs text-muted">Banco: {card.bank} • Fecha dia {card.closingDay} • Vence dia {card.dueDay}</span>
          <span className="mt-1 block text-xs text-muted">Conta de pagamento: {(accounts ?? []).find((a: any) => a.id === card.paymentAccountId)?.name ?? '—'}</span>
        </div>
        <button className="btn-secondary" onClick={() => setEditingCard(true)}><Pencil size={16} />Editar</button>
      </div>

      {/* Bloco principal único - hierarquia clara */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl text-white" style={{ backgroundColor: card.color }}><CardIcon size={24} /></span>
          <div className="min-w-0 flex-1">
            <strong className="block text-base">{card.name}</strong>
            <span className="block text-xs text-muted">Banco: {card.bank} — dados do cadastro</span>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusLabel(current?.status ?? 'open').className}`}>{statusLabel(current?.status ?? 'open').label}</span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <span className="block text-xs font-medium text-muted">Fatura atual</span>
            <strong className="mt-1 block text-2xl tabular-nums">{money(current?.remainingCents ?? 0, hideBalances)}</strong>
            <span className="mt-1 block text-xs text-muted">Fecha {current?.closingDate ?? '-'} • Vence {current?.dueDate ?? '-'}</span>
            {current && current.totalCents > 0 && current.paidCents > 0 && <span className="mt-1 block text-xs text-brand">Pago {money(current.paidCents, hideBalances)} de {money(current.totalCents, hideBalances)}</span>}
          </div>
          <div className="sm:text-center">
            <span className="block text-xs font-medium text-muted">Limite utilizado</span>
            <strong className={`mt-1 block text-lg tabular-nums ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : ''}`}>{money(summary?.usedCents ?? 0, hideBalances)}</strong>
            <span className="mt-1 block text-xs text-muted">{pct}% de {money(card.limitCents, hideBalances)}</span>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
          <div className="sm:text-right">
            <span className="block text-xs font-medium text-muted">Disponível</span>
            <strong className="mt-1 block text-lg tabular-nums text-emerald-600">{money(summary?.availableCents ?? 0, hideBalances)}</strong>
            <span className="mt-1 block text-xs text-muted">Parceladas ativas: {summary?.installmentsInProgress ?? 0}</span>
          </div>
        </div>

        {current && current.remainingCents > 0 && (
          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1" onClick={() => setPaying(current.closingDate)}><Wallet size={16} />Pagar fatura</button>
            <button className="btn-secondary" onClick={() => setShowPurchase(true)}><Plus size={16} />Compra</button>
          </div>
        )}
        {current && current.remainingCents === 0 && current.totalCents > 0 && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-700">Fatura paga • Disponível liberado</p>
        )}
      </Card>

      {/* Próximas faturas - visão compacta */}
      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Próximas faturas</h3>
          <span className="text-xs text-muted">{upcomingCompact.length} meses</span>
        </div>
        {upcomingCompact.length ? (
          <div className="mt-3 divide-y divide-slate-100 rounded-xl border">
            {upcomingCompact.map(inv => (
              <div key={inv.closingDate} className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm font-medium">{new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(`${inv.closingDate}T12:00:00`)).replace(/^./, c => c.toUpperCase())}</span>
                <span className="text-sm tabular-nums">{money(inv.remainingCents, hideBalances)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Sem faturas futuras com lançamentos.</p>
        )}
        <p className="mt-2 text-xs text-muted">Valores consideram apenas parcelas já previstas. Novas compras entram automaticamente conforme o dia de fechamento.</p>
      </Card>

      {/* Faturas - lista expansível, sem card por mês */}
      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Faturas</h3>
          <button className="text-xs font-semibold text-brand" onClick={() => setShowAllInvoices(v => !v)}>{showAllInvoices ? 'Recentes' : 'Ver histórico'}</button>
        </div>
        <div className="mt-3 space-y-2">
          {(showAllInvoices ? invoices : invoices.slice(0, 4)).map(inv => {
            const isExpanded = expandedInvoice === inv.closingDate
            const meta = statusLabel(inv.status)
            return (
              <div key={inv.closingDate} className="rounded-xl border">
                <button onClick={() => setExpandedInvoice(isExpanded ? null : inv.closingDate)} className="flex w-full items-center justify-between gap-3 p-3 text-left">
                  <div className="min-w-0">
                    <strong className="block text-sm">{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${inv.closingDate}T12:00:00`)).replace(/^./, c => c.toUpperCase())}</strong>
                    <span className="block text-xs text-muted">Fecha {inv.closingDate} • Vence {inv.dueDate} • {inv.installments.length} lançamentos</span>
                  </div>
                  <div className="text-right">
                    <strong className="block text-sm tabular-nums">{money(inv.remainingCents, hideBalances)}</strong>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>{meta.label}</span>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                </button>
                {isExpanded && (
                  <div className="border-t bg-slate-50 p-3 text-xs">
                    <div className="flex justify-between text-xs"><span className="text-muted">Total</span><strong>{money(inv.totalCents, hideBalances)}</strong></div>
                    <div className="flex justify-between"><span className="text-muted">Pago</span><strong className="text-emerald-600">{money(inv.paidCents, hideBalances)}</strong></div>
                    <div className="flex justify-between font-bold"><span>Restante</span><span>{money(inv.remainingCents, hideBalances)}</span></div>
                    {inv.installments.length ? (
                      <div className="mt-3 space-y-1">
                        {inv.installments.map((it, idx) => (
                          <div key={`${it.purchaseId}-${it.installmentNumber}-${idx}`} className="flex justify-between gap-2">
                            <span className="truncate">{it.purchaseDescription} <small className="text-muted">• {it.installmentNumber}/{it.totalInstallments} • {it.category}</small></span>
                            <span className="font-semibold">{money(it.amountCents, hideBalances)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-muted">Sem lançamentos nesta fatura.</p>
                    )}
                    {inv.remainingCents > 0 && (
                      <button className="btn-primary mt-3 w-full !py-2 text-xs" onClick={() => setPaying(inv.closingDate)}><Receipt size={14} />Pagar esta fatura</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Compras - lista compacta */}
      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Compras</h3>
          <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => setShowPurchase(true)}><Plus size={14} />Nova</button>
        </div>
        {purchases.length ? (
          <>
            <div className="mt-3 divide-y divide-slate-100">
              {(showAllPurchases ? purchases : purchases.slice(0, 5)).map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><CardIcon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{p.description}</strong>
                    <span className="block truncate text-xs text-muted">{p.category} • {p.installments}x • {p.purchaseDate} {p.status === 'cancelled' ? '• Cancelada' : ''}</span>
                  </div>
                  <div className="text-right">
                    <strong className="block text-sm tabular-nums">{money(p.totalAmountCents, hideBalances)}</strong>
                    <span className="block text-xs text-muted">{p.installments}x</span>
                  </div>
                  <div className="flex gap-1">
                    <button className="rounded-lg p-1.5 text-muted hover:bg-slate-100" onClick={() => cancelCreditCardPurchase(p.id)} title={p.status === 'cancelled' ? 'Restaurar' : 'Cancelar'}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
            {purchases.length > 5 && (
              <button className="mt-3 w-full text-center text-xs font-semibold text-brand" onClick={() => setShowAllPurchases(v => !v)}>{showAllPurchases ? 'Mostrar menos' : `Ver todas (${purchases.length})`}</button>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">Nenhuma compra registrada neste cartão.</p>
        )}
      </Card>

      {showPurchase && <PurchaseModal cardId={card.id} close={() => setShowPurchase(false)} />}
      {paying && (
        <PaymentModal
          cardId={card.id}
          invoiceClosingDate={paying}
          remainingCents={invoices.find(i => i.closingDate === paying)?.remainingCents ?? 0}
          totalCents={invoices.find(i => i.closingDate === paying)?.totalCents ?? 0}
          dueDate={invoices.find(i => i.closingDate === paying)?.dueDate ?? ''}
          close={() => setPaying(null)}
        />
      )}
      {editingCard && <CreditCardModal item={card} close={() => setEditingCard(false)} />}
    </>
  )
}
