import { useMemo, useState } from 'react'
import { Check, ChartPie, CircleDollarSign, Goal, Pencil, PiggyBank, ReceiptText, ShieldCheck, Sparkles, Wallet, X, Trash2, ChevronUp, ChevronDown, type LucideIcon } from 'lucide-react'
import { Card, CategoryIcon, MoneyInput, Modal, SelectMenu } from './components'
import { money, today, uid } from './domain'
import { useFinanceStore } from './store'
import { preparePaymentAllocationPlan } from './services/financialEngine'

function formatDate(d: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${d}T12:00:00`)).replace('.', '')
}

function shortDate(d: string) {
  const date = new Date(`${d}T12:00:00`)
  const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const year = date.getFullYear() !== new Date().getFullYear() ? ` ${date.getFullYear()}` : ''
  return `${String(date.getDate()).padStart(2, '0')} ${month}${year}`
}

const itemTypeLabels: Record<string, string> = { bill: 'Conta', budget: 'Orçamento', goal: 'Meta', reserve: 'Reserva', safety: 'Margem', free: 'Livre' }
const planStatusLabels: Record<string, string> = { draft: 'Rascunho', applied: 'Aplicado', cancelled: 'Cancelado' }
const typeBadge = (item: { label: string; type: string }) => {
  const label = itemTypeLabels[item.type] ?? item.type
  return item.label.toLowerCase().includes(label.toLowerCase()) ? null : label
}

function paymentItemVisual(type: string): { icon: LucideIcon; color: string; backgroundColor: string } {
  if (type === 'bill') return { icon: ReceiptText, color: '#B45309', backgroundColor: '#FEF3C7' }
  if (type === 'budget') return { icon: ChartPie, color: '#2F80ED', backgroundColor: '#E8F1FE' }
  if (type === 'goal') return { icon: Goal, color: '#7C3AED', backgroundColor: '#F0EAFE' }
  if (type === 'reserve') return { icon: PiggyBank, color: '#16835D', backgroundColor: '#E5F8EF' }
  if (type === 'safety') return { icon: ShieldCheck, color: '#2563EB', backgroundColor: '#DBEAFE' }
  if (type === 'free') return { icon: CircleDollarSign, color: '#16835D', backgroundColor: '#E5F8EF' }
  return { icon: Wallet, color: '#64748B', backgroundColor: '#F1F5F9' }
}

export function PaymentOrganizerCard() {
  const { transactions, paymentAllocationPlans } = useFinanceStore() as any
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const recentIncomes = useMemo(() => {
    return (transactions as any[])
      .filter((t: any) => !t.deletedAt && t.type === 'income')
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
      .slice(0, 5)
  }, [transactions])

  const draftPlans = (paymentAllocationPlans ?? []).filter((p: any) => p.status === 'draft').sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
  const appliedPlans = (paymentAllocationPlans ?? []).filter((p: any) => p.status === 'applied').sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)

  const recentIncomeNotOrganized = recentIncomes.find((inc: any) => {
    const hasPlan = (paymentAllocationPlans ?? []).some((p: any) => p.sourceTransactionId === inc.id && p.status !== 'cancelled')
    return !hasPlan
  })

  const handleOrganize = (income?: any) => {
    const amount = income ? income.amountCents : 450000
    const plan = preparePaymentAllocationPlan({ receivedAmountInCents: amount, sourceTransactionId: income?.id })
    ;(useFinanceStore.getState() as any).savePaymentAllocationPlan(plan)
    setEditingPlanId(plan.id)
  }

  if (!recentIncomes.length && !draftPlans.length && !appliedPlans.length) return null

  return (
    <>
      <Card className="dashboard-card">
        <div className="card-heading">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-white"><Wallet size={16} /></span>
            <div>
              <h2>Organizar pagamento</h2>
              <p className="text-xs text-muted">Distribua recebimentos por compromissos</p>
            </div>
          </div>
          <button className="text-xs font-semibold text-brand" onClick={() => setShowHistory(v => !v)}>{showHistory ? 'Ocultar' : 'Histórico'}</button>
        </div>

        {recentIncomeNotOrganized && (
          <div className="mt-4 rounded-2xl bg-blue-50 p-4 animate-enter" style={{ animationDelay: '120ms' }}>
            <p className="text-xs font-semibold text-brand">Seu pagamento chegou</p>
            <p className="mt-1 text-lg font-bold">{money(recentIncomeNotOrganized.amountCents)} — {recentIncomeNotOrganized.description}</p>
            <p className="mt-1 text-xs text-muted">{formatDate(recentIncomeNotOrganized.date)} • Quer organizar esse dinheiro até seu próximo recebimento?</p>
            <button className="btn-primary mt-3 transition hover:scale-[1.02] active:scale-[0.98]" onClick={() => handleOrganize(recentIncomeNotOrganized)}><Sparkles size={16} /> Organizar agora</button>
          </div>
        )}

        {!recentIncomeNotOrganized && !draftPlans.length && (
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={() => handleOrganize()}><Wallet size={16} /> Organizar pagamento</button>
            <button className="btn-secondary" onClick={() => handleOrganize(recentIncomes[0])} disabled={!recentIncomes[0]}>Usar último</button>
          </div>
        )}

        {draftPlans.length > 0 && (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-semibold">Rascunhos para revisar</h3>
            {draftPlans.slice(0, 2).map((plan: any, idx: number) => (
              <div key={plan.id} className="rounded-xl border p-3 animate-slide bg-white" style={{ animationDelay: `${idx * 80}ms` }}>
                <div className="flex items-center justify-between">
                  <strong className="text-sm">{money(plan.receivedAmountInCents)} • {shortDate(plan.periodStart)} até {shortDate(plan.periodEnd)}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${plan.freeAmountInCents < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{plan.freeAmountInCents < 0 ? `Déficit ${money(Math.abs(plan.freeAmountInCents))}` : `Livre ${money(plan.freeAmountInCents)}`}</span>
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  {plan.items.slice(0, 4).map((it: any) => {
                    const visual = paymentItemVisual(it.type)
                    const ItemIcon = visual.icon
                    return <div key={it.id} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-muted"><ItemIcon size={14} color={visual.color} strokeWidth={1.9}/><span className="truncate">{it.label}{typeBadge(it) && <small className="text-[10px]"> {typeBadge(it)}</small>}</span></span><span className={it.isConsumed ? 'line-through text-muted' : 'font-medium'}>{money(it.amountInCents)}</span></div>
                  })}
                  {plan.items.length > 4 && <p className="text-muted">+{plan.items.length - 4} itens</p>}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button className="btn-secondary !px-2 !py-1.5 text-xs" onClick={() => setEditingPlanId(plan.id)}><Pencil size={12} /> Editar</button>
                  <button className="btn-secondary !px-2 !py-1.5 text-xs" onClick={() => (useFinanceStore.getState() as any).cancelPaymentAllocationPlan(plan.id)}>Cancelar</button>
                  <button className="btn-primary !px-2 !py-1.5 text-xs" onClick={() => (useFinanceStore.getState() as any).applyPaymentAllocationPlan(plan.id)}><Check size={12} /> Aplicar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {appliedPlans.length > 0 && !showHistory && (
          <div className="mt-4 rounded-xl bg-emerald-50 p-3 animate-enter check-pop" style={{ animationDelay: '180ms' }}>
            <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-white"><Check size={12} strokeWidth={2.5} /></span> Pagamento organizado</p>
            <p className="mt-1 text-sm"><strong>{money(appliedPlans[0].items.filter((i: any) => i.type !== 'free' && !i.isConsumed).reduce((s: number, i: any) => s + i.amountInCents, 0))}</strong> reservado • <strong>{money(appliedPlans[0].freeAmountInCents)}</strong> livre</p>
            <p className="mt-1 text-xs text-muted">{shortDate(appliedPlans[0].periodStart)} • {appliedPlans[0].items.length} itens</p>
          </div>
        )}

        {showHistory && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold">Histórico</h3>
            {(paymentAllocationPlans ?? []).slice(-5).reverse().map((plan: any) => (
              <div key={plan.id} className="rounded-xl border bg-slate-50 p-3 text-xs">
                <div className="flex justify-between"><span className="font-semibold">{formatDate(plan.periodStart)} • {money(plan.receivedAmountInCents)}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${plan.status === 'applied' ? 'bg-emerald-100 text-emerald-700' : plan.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{planStatusLabels[plan.status] ?? plan.status}</span></div>
                <p className="mt-1 text-muted">Reservado {money(plan.items.filter((i: any) => i.type !== 'free').reduce((s: number, i: any) => s + i.amountInCents, 0))} • Livre {money(plan.freeAmountInCents)}</p>
                <button className="mt-2 text-xs font-semibold text-brand" onClick={() => setEditingPlanId(plan.id)}>Ver detalhes</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editingPlanId && <PaymentAllocationPreview planId={editingPlanId} close={() => setEditingPlanId(null)} />}
    </>
  )
}

function PaymentAllocationPreview({ planId, close }: { planId: string; close: () => void }) {
  const { paymentAllocationPlans, goals } = useFinanceStore() as any
  const plan = (paymentAllocationPlans ?? []).find((p: any) => p.id === planId)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [goalPicker, setGoalPicker] = useState<string | null>(null)

  if (!plan) return null

  const totalAllocated = plan.items.filter((i: any) => i.type !== 'free').reduce((s: number, i: any) => s + i.amountInCents, 0)
  const deficit = totalAllocated > plan.receivedAmountInCents ? totalAllocated - plan.receivedAmountInCents : 0
  const isDraft = plan.status === 'draft'
  const uncovered = deficit > 0 ? plan.items.filter((it: any) => it.type !== 'free').slice(-2) : []

  const handleMove = (itemId: string, dir: -1 | 1) => {
    const idx = plan.items.findIndex((it: any) => it.id === itemId)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= plan.items.length) return
    // não mover o Livre (sempre último)
    if (plan.items[idx].type === 'free' || plan.items[newIdx].type === 'free') return
    const ids = plan.items.map((it: any) => it.id)
    const tmp = ids[idx]; ids[idx] = ids[newIdx]; ids[newIdx] = tmp
    ;(useFinanceStore.getState() as any).reorderPaymentAllocationItems(plan.id, ids)
  }

  const handleGoalChange = (itemId: string, goalId: string) => {
    const goal = (goals ?? []).find((g: any) => g.id === goalId)
    if (!goal) return
    ;(useFinanceStore.getState() as any).updatePaymentAllocationItemMeta(plan.id, itemId, { label: goal.title, goalId })
    setGoalPicker(null)
  }

  return (
    <Modal title="✦ Organização sugerida" close={close}>
      <div className="rounded-2xl bg-blue-50 p-4 text-center">
        <p className="text-xs font-semibold text-brand">Você recebeu</p>
        <p className="mt-1 text-2xl font-bold">{money(plan.receivedAmountInCents)}</p>
        <p className="mt-1 text-xs text-muted">{shortDate(plan.periodStart)} até {shortDate(plan.periodEnd)}</p>
      </div>

      <div className="mt-4 divide-y divide-slate-100 rounded-2xl border overflow-hidden">
        {plan.items.map((item: any, idx: number) => (
          <div key={item.id} className={`payment-alloc-item flex items-center gap-2 p-3 ${deficit>0 && uncovered.some((u:any)=>u.id===item.id) ? 'bg-red-50/50 shake' : ''}`} style={{ animationDelay: `${idx * 45}ms` }}>
            {isDraft && item.type !== 'free' && (
              <div className="flex flex-col">
                <button disabled={idx===0} onClick={()=> handleMove(item.id, -1)} className="p-0.5 text-muted hover:text-brand disabled:opacity-20"><ChevronUp size={12}/></button>
                <button disabled={idx>=plan.items.length-2} onClick={()=> handleMove(item.id, 1)} className="p-0.5 text-muted hover:text-brand disabled:opacity-20"><ChevronDown size={12}/></button>
              </div>
            )}
            {(() => {
              const visual = paymentItemVisual(item.type)
              return <CategoryIcon icon={visual.icon} color={visual.color} backgroundColor={visual.backgroundColor} size={15} className="!h-8 !w-8" />
            })()}
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${item.isConsumed ? 'line-through text-muted' : ''}`}>{item.label}{typeBadge(item) && <small className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{typeBadge(item)}</small>} {item.isConsumed && <small className="text-emerald-600">• consumido</small>}</p>
              {item.recurringExpenseId && <p className="truncate text-xs text-muted">conta • {item.categoryId}</p>}
              {item.type === 'goal' && goalPicker === item.id && (
                <div className="mt-1">
                  <SelectMenu ariaLabel="Mudar meta" value={item.goalId ?? ''} onChange={v=> handleGoalChange(item.id, v)} options={(goals ?? []).map((g:any)=> ({ value: g.id, label: g.title }))} />
                </div>
              )}
            </div>
            <div className="text-right">
              {editing === item.id ? (
                <div className="flex items-center gap-1">
                  <MoneyInput ariaLabel={`Valor de ${item.label}`} value={editValue} onChange={setEditValue} />
                  <button className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white" onClick={() => {
                    const cents = Math.round(Number(editValue.replace(/\./g,'').replace(',','.'))*100) || 0
                    ;(useFinanceStore.getState() as any).updatePaymentAllocationItem(plan.id, item.id, cents); setEditing(null)
                  }}><Check size={14} /></button>
                </div>
              ) : (
                <button
                  disabled={!isDraft || item.type === 'free'}
                  onClick={() => { if (!isDraft || item.type === 'free') return; setEditing(item.id); setEditValue((item.amountInCents / 100).toFixed(2).replace('.', ',')) }}
                  className={`text-sm font-bold tabular-nums ${item.type === 'free' ? 'text-emerald-600' : ''} ${isDraft && item.type !== 'free' ? 'hover:text-brand' : ''}`}
                >
                  {money(item.amountInCents)}
                </button>
              )}
            </div>
            {isDraft && item.type !== 'free' && (
              <>
                <button className="text-muted hover:text-brand" onClick={() => setEditing(item.id)}><Pencil size={14} /></button>
                <button className="text-muted hover:text-red-600" title="Remover reserva" onClick={() => (useFinanceStore.getState() as any).removePaymentAllocationItem(plan.id, item.id)}><Trash2 size={14} /></button>
                {item.type === 'goal' && <button className="text-xs font-semibold text-brand" onClick={()=> setGoalPicker(goalPicker===item.id? null : item.id)}>Meta</button>}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3 animate-enter" style={{ animationDelay: '280ms' }}>
        <div className="flex justify-between text-sm"><span>Total alocado</span><strong className="tabular-nums transition-all">{money(totalAllocated)}</strong></div>
        <div className="flex justify-between text-sm"><span>Recebido</span><strong>{money(plan.receivedAmountInCents)}</strong></div>
        <div className={`mt-2 flex justify-between rounded-xl p-2 text-sm font-bold transition-colors ${plan.freeAmountInCents < 0 ? 'bg-red-50 text-red-700 shake' : 'bg-emerald-50 text-emerald-700'}`}>
          <span>{plan.freeAmountInCents < 0 ? 'Faltam' : 'Livre'}</span>
          <span className="tabular-nums">{plan.freeAmountInCents < 0 ? money(Math.abs(plan.freeAmountInCents)) : money(plan.freeAmountInCents)}</span>
        </div>
        {deficit > 0 && (
          <div className="mt-2 rounded-xl bg-red-50 p-2 text-xs text-red-700 animate-enter shake">
            Faltam {money(deficit)} para cobrir todo o planejamento. {uncovered.length ? `Itens sem cobertura: ${uncovered.map((u:any)=>u.label).join(', ')}.` : ''} Itens sem cobertura ficarão pendentes.
          </div>
        )}
        {plan.freeAmountInCents >=0 && plan.freeAmountInCents < 5000 && (
          <p className="mt-2 text-xs text-amber-700">Margem baixa — considere reduzir uma reserva ou aumentar o recebimento.</p>
        )}
      </div>

      {isDraft ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button className="btn-secondary" onClick={close}><Pencil size={14} /> Editar</button>
          <button className="btn-secondary" onClick={() => { (useFinanceStore.getState() as any).cancelPaymentAllocationPlan(plan.id); close() }}><X size={14} /> Cancelar</button>
          <button className="btn-primary" onClick={() => { (useFinanceStore.getState() as any).applyPaymentAllocationPlan(plan.id); close() }}><Check size={14} /> Aplicar organização</button>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={close}>Fechar</button>
          {plan.status === 'applied' && <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">Aplicado</span>}
          {plan.status === 'cancelled' && <span className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">Cancelado</span>}
        </div>
      )}
    </Modal>
  )
}
