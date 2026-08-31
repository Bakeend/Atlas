import { CreditCard as CreditCardIcon, Plus, ChevronRight, Trash2, Archive, Pencil, Wallet } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Card, Empty, PageTitle } from '../components'
import { money } from '../domain'
import { useFinanceStore } from '../store'
import { getCardSummary } from './creditCardService'
import { CreditCardModal } from './CreditCardModal'

export function CreditCardsPage() {
  const { creditCards, creditCardPurchases, creditCardInvoicePayments, hideBalances, deleteCreditCard, archiveCreditCard, accounts } = useFinanceStore() as any
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const navigate = useNavigate()
  const cards = (creditCards ?? []) as any[]
  const active = cards.filter(c => !c.archived)
  const archived = cards.filter(c => c.archived)
  const totalLimit = active.reduce((s: number, c: any) => s + c.limitCents, 0)
  const totalUsed = active.reduce((s: number, c: any) => {
    const summary = getCardSummary(c, creditCardPurchases ?? [], creditCardInvoicePayments ?? [])
    return s + summary.usedCents
  }, 0)
  const totalAvailable = Math.max(0, totalLimit - totalUsed)
  const totalInvoice = active.reduce((s: number, c: any) => {
    const summary = getCardSummary(c, creditCardPurchases ?? [], creditCardInvoicePayments ?? [])
    return s + (summary.currentInvoice?.remainingCents ?? 0)
  }, 0)

  const editingCard = editing ? cards.find((c: any) => c.id === editing) : undefined

  return (
    <>
      <PageTitle eyebrow="Organização" title="Cartões de crédito" backTo="/organizar" backLabel="Organizar">
        <button className="btn-primary" onClick={() => setModal(true)}><Plus size={18} />Novo cartão</button>
      </PageTitle>

      {/* Resumo principal único */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand"><Wallet size={20} /></span>
          <div>
            <h2 className="text-sm font-bold">Resumo dos cartões</h2>
            <p className="text-xs text-muted">{active.length} {active.length === 1 ? 'cartão ativo' : 'cartões ativos'} • Fatura atual {money(totalInvoice, hideBalances)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="block text-xs text-muted">Limite total</span>
            <strong className="mt-1 block text-sm tabular-nums">{money(totalLimit, hideBalances)}</strong>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="block text-xs text-muted">Utilizado</span>
            <strong className={`mt-1 block text-sm tabular-nums ${totalUsed > totalLimit * 0.9 ? 'text-red-600' : totalUsed > totalLimit * 0.7 ? 'text-amber-600' : 'text-ink'}`}>{money(totalUsed, hideBalances)}</strong>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <span className="block text-xs text-muted">Disponível</span>
            <strong className="mt-1 block text-sm tabular-nums text-emerald-700">{money(totalAvailable, hideBalances)}</strong>
          </div>
        </div>
        {totalUsed > totalLimit * 0.7 && (
          <p className={`mt-3 rounded-xl p-3 text-xs ${totalUsed > totalLimit * 0.9 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
            {totalUsed > totalLimit * 0.9 ? 'Atenção: limite acima de 90% — risco de estouro.' : 'Alerta: acima de 70% do limite utilizado.'}
          </p>
        )}
      </Card>

      {/* Lista de cartões - hierarquia compacta */}
      <div className="mt-5">
        {active.length ? (
          <div className="space-y-3">
            {active.map((card: any) => {
              const summary = getCardSummary(card, creditCardPurchases ?? [], creditCardInvoicePayments ?? [])
              const pct = card.limitCents ? Math.round((summary.usedCents / card.limitCents) * 100) : 0
              const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
              return (
                <Card key={card.id} className="!p-0 overflow-hidden">
                  <button onClick={() => navigate(`/cards/${card.id}`)} className="flex w-full items-center gap-3 p-4 text-left">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: card.color }}><CreditCardIcon size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{card.name}</strong>
                      <span className="block truncate text-xs text-muted">{card.bank} • Fecha dia {card.closingDay} • Vence dia {card.dueDay}</span>
                      <span className="block truncate text-xs text-muted">Conta: {(accounts ?? []).find((a: any) => a.id === card.paymentAccountId)?.name ?? '—'}</span>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <strong className="block text-sm tabular-nums">{money(summary.currentInvoice?.remainingCents ?? 0, hideBalances)}</strong>
                      <span className="block text-xs text-muted">{pct}% usado</span>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-slate-300" />
                  </button>
                  <div className="flex gap-2 border-t bg-slate-50 px-3 py-2">
                    <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-white" onClick={() => setEditing(card.id)}><Pencil size={14} />Editar</button>
                    <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-white" onClick={() => archiveCreditCard(card.id, true)}><Archive size={14} />Arquivar</button>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Empty title="Nenhum cartão cadastrado" text="Adicione seus cartões para controlar faturas, limites e parcelas sem misturar com o saldo bancário." action={<button className="btn-primary" onClick={() => setModal(true)}>Cadastrar cartão</button>} />
        )}
      </div>

      {archived.length > 0 && (
        <Card className="mt-5">
          <h3 className="text-sm font-semibold">Arquivados</h3>
          <div className="mt-3 divide-y divide-slate-100">
            {archived.map((card: any) => (
              <div key={card.id} className="flex items-center justify-between py-2">
                <span className="text-sm">{card.name} • {card.bank}</span>
                <div className="flex gap-2">
                  <button className="text-xs font-semibold text-brand" onClick={() => archiveCreditCard(card.id, false)}>Reativar</button>
                  <button className="text-xs font-semibold text-red-600" onClick={() => deleteCreditCard(card.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {modal && <CreditCardModal close={() => setModal(false)} />}
      {editingCard && <CreditCardModal item={editingCard} close={() => setEditing(null)} />}
    </>
  )
}
