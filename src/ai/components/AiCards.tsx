import { ArrowDownLeft, ArrowUpRight, Check, PiggyBank, ReceiptText, Repeat2, Sparkles, Target, Wallet, X } from 'lucide-react'
import { money } from '../../domain'
import { useFinanceStore } from '../../store'
import { executeTool } from '../tools/registry'

export function AiTransactionCard({ data, onUndo }: { data:any; onUndo?: (id:string)=>void }) {
  const tx = data?.transaction ?? data
  if (!tx) return null
  const isIncome = tx.type==='income' || data?.transaction?.type==='income'
  return (
    <div className="ai-card">
      <div className="ai-card-header"><ReceiptText size={16} className="text-brand"/> <strong>Despesa registrada</strong> <span className={`ai-badge ${isIncome?'income':'expense'}`}>{isIncome?'Receita':'Despesa'}</span></div>
      <div className="ai-card-body">
        <strong>{tx.description ?? tx.title ?? 'Movimentação'}</strong>
        <span className={isIncome?'text-emerald-600':'text-red-600'}>{tx.amount ?? money(tx.amountCents ?? 0)}</span>
        <small>{tx.category ?? ''} {tx.date ? `· ${tx.date}` : ''}</small>
      </div>
      {onUndo && tx.id && <button className="ai-undo" onClick={()=> onUndo(tx.id)}>Desfazer</button>}
    </div>
  )
}

export function AiRecurringCard({ data }: { data:any }) {
  const r = data?.recurringExpense ?? data?.recurringIncome ?? data
  if (!r) return null
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Repeat2 size={16} className="text-brand"/> <strong>{r.name ?? r.title}</strong></div>
      <div className="ai-card-body">
        <span>{r.amount ?? money(r.amountCents ?? 0)}</span>
        <small>{r.category} · {r.frequency} {r.dueDay ? `· dia ${r.dueDay}` : ''}</small>
      </div>
    </div>
  )
}

export function AiBudgetCard({ data }: { data:any }) {
  const b = data?.budget ?? data
  if (!b) return null
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Wallet size={16} className="text-brand"/> <strong>Orçamento</strong></div>
      <div className="ai-card-body"><strong>{b.category}</strong><span>{b.limit ?? money(b.limitCents ?? 0)}</span><small>{b.month ?? ''}</small></div>
    </div>
  )
}

export function AiGoalCard({ data }: { data:any }) {
  const g = data?.goal ?? data
  if (!g) return null
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Target size={16} className="text-brand"/> <strong>Meta</strong></div>
      <div className="ai-card-body"><strong>{g.title}</strong><span>{g.target ?? money(g.targetAmountInCents ?? g.targetCents ?? 0)}</span></div>
    </div>
  )
}

export function AiAnalysisCard({ data }: { data:any }) {
  if (!data) return null
  const breakdown = data.breakdown ?? data.anomalies ?? []
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Sparkles size={16} className="text-brand"/> <strong>Análise</strong></div>
      <div className="ai-card-body">
        <div className="text-sm">{data.totalFormatted ? `Total: ${data.totalFormatted}` : data.message ?? ''}</div>
        {Array.isArray(breakdown) && breakdown.slice(0,4).map((it:any,i:number)=> (
          <div key={i} className="ai-analysis-row"><span>{it.category ?? it.title ?? it.month}</span><span>{it.formatted ?? it.total ?? money(it.cents ?? 0)} {it.percent ? `· ${it.percent}%` : ''} {it.deltaPercent ? `· +${it.deltaPercent}%` : ''}</span></div>
        ))}
      </div>
    </div>
  )
}

export function AiPlanCard({ data, onApply, onCancel }: { data:any; onApply:(id:string)=>void; onCancel:()=>void }) {
  const plan = data?.plan ?? data
  if (!plan) return null
  const allocations = plan.allocations ?? []
  return (
    <div className="ai-card ai-plan">
      <div className="ai-card-header"><PiggyBank size={16} className="text-brand"/> <strong>✦ Plano preparado</strong></div>
      <p className="ai-plan-subtitle">Disponível: {plan.available ?? money(plan.availableAmountInCents ?? 0)} · Alocado: {plan.totalAllocated ?? ''}</p>
      <div className="ai-plan-list">
        {allocations.map((a:any,i:number)=> (
          <div key={i} className="ai-plan-item"><span>{a.label} <small>{a.type}</small></span><strong>{a.amount ?? money(a.amountInCents ?? 0)}</strong></div>
        ))}
      </div>
      {plan.freeAfter && <p className="ai-plan-free">Livre após o planejamento: {plan.freeAfter}</p>}
      {plan.warnings?.length>0 && <p className="ai-plan-warn">{plan.warnings[0]}</p>}
      <div className="ai-plan-actions">
        <button className="btn-secondary" onClick={onCancel}><X size={16}/> Cancelar</button>
        <button className="btn-primary" onClick={()=> onApply(plan.id)}><Check size={16}/> Aplicar organização</button>
      </div>
    </div>
  )
}

export function AiSafeDailyCard({ data }: { data:any }) {
  if (!data) return null
  const isSim = !!data.simulation
  if (isSim) {
    return (
      <div className="ai-card">
        <div className="ai-card-header"><Wallet size={16} className="text-brand"/> <strong>Simulação</strong></div>
        <div className="ai-card-body">
          <strong>{data.amount ?? money(data.amountInCents ?? 0)} hoje</strong>
          <small>Dinheiro livre: {data.freeBefore ?? data.freeBeforeFormatted} → {data.freeAfter ?? data.freeAfterFormatted}</small>
          <small>Novo limite médio: {data.newDaily ?? data.newDailyFormatted}/dia {data.daysAfter ? `(${data.daysAfter} dias)` : ''}</small>
          {data.nextIncomeDate && <small>Próximo pagamento: {data.nextIncomeDate}</small>}
          {data.note && <small className="text-amber-700">{data.note}</small>}
        </div>
      </div>
    )
  }
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Wallet size={16} className="text-brand"/> <strong>Quanto posso gastar hoje</strong></div>
      <div className="ai-card-body">
        {data.remainingToday ? <><strong className="text-emerald-700">{data.remainingToday}</strong><small>Restante hoje de {data.safeDaily} (usado {data.spentToday})</small></> : <><strong>{data.safeDaily ?? '—'}</strong><small>{data.message ?? ''}</small></>}
        <small>Dinheiro livre: {data.freeMoney} {data.daysUntilNextIncome ? `• ${data.daysUntilNextIncome} dias até ${data.nextIncomeDate}` : ''}</small>
        {data.nextBill && <small>Próxima conta: {data.nextBill.name} — {data.nextBill.amountFormatted} em {data.nextBill.date}</small>}
        {data.status === 'over' && <small className="text-red-600">Você ultrapassou em {money(Math.abs((data.remainingTodayInCents ?? 0)))} — limite dos próximos dias ajustado.</small>}
      </div>
    </div>
  )
}

export function AiPaymentPlanCard({ data, onApply, onCancel }: { data:any; onApply:(id:string)=>void; onCancel:(id:string)=>void }) {
  const plan = data?.plan ?? data
  if (!plan) return null
  const items = plan.items ?? []
  const isDraft = plan.status === 'draft' || !plan.status
  return (
    <div className="ai-card ai-plan">
      <div className="ai-card-header"><PiggyBank size={16} className="text-brand"/> <strong>✦ Organização sugerida</strong></div>
      <p className="ai-plan-subtitle">Você recebeu {plan.receivedAmount ?? money(plan.receivedAmountInCents ?? 0)} {plan.period ? `• ${plan.period}` : ''}</p>
      <div className="ai-plan-list">
        {items.slice(0, 6).map((it:any, i:number) => (
          <div key={i} className="ai-plan-item"><span>{it.label} <small>{it.type}</small></span><strong>{it.amount ?? money(it.amountInCents ?? 0)}</strong></div>
        ))}
        {items.length > 6 && <p className="text-xs text-muted">+{items.length - 6} itens</p>}
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span>Livre: <strong className={plan.freeAmountInCents < 0 ? 'text-red-600' : 'text-emerald-600'}>{plan.freeAmount ?? money(plan.freeAmountInCents ?? 0)}</strong></span>
        {plan.deficit && <span className="text-red-600">Déficit {plan.deficit}</span>}
        {plan.deficitInCents > 0 && <span className="text-red-600">Faltam {money(plan.deficitInCents)}</span>}
      </div>
      {isDraft ? (
        <div className="ai-plan-actions">
          <button className="btn-secondary" onClick={() => onCancel(plan.id)}><X size={16}/> Cancelar</button>
          <button className="btn-primary" onClick={() => onApply(plan.id)}><Check size={16}/> Aplicar</button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Status: {plan.status}</p>
      )}
    </div>
  )
}

export function AiFreeMoneyCard({ data }: { data:any }) {
  if (!data) return null
  if (data.insufficient) {
    return (
      <div className="ai-card">
        <div className="ai-card-header"><Wallet size={16} className="text-amber-600"/> <strong>Dinheiro livre</strong></div>
        <div className="ai-card-body">
          <p className="text-sm text-amber-800">{data.message}</p>
          <small className="text-muted">Período: {data.period?.label ?? ''}</small>
        </div>
      </div>
    )
  }
  const isBreakdown = !!data.breakdown
  if (isBreakdown) {
    const b = data.breakdown
    return (
      <div className="ai-card">
        <div className="ai-card-header"><Wallet size={16} className="text-emerald-600"/> <strong>Dinheiro livre — detalhamento</strong></div>
        <div className="ai-card-body text-xs">
          <div className="flex justify-between"><span>Saldo total</span><strong>{b.saldoTotal?.formatted ?? data.total ?? '—'}</strong></div>
          <div className="flex justify-between"><span>Separado para contas</span><strong>{b.separadoParaContas?.formatted ?? '—'}</strong></div>
          {b.separadoParaContas?.detalhes?.slice(0,3).map((d:any,i:number)=> <div key={i} className="flex justify-between text-[11px] text-muted"><span>{d.nome} {d.estimado==='Estimado' ? '• Estimado' : ''}</span><span>{d.valor}</span></div>)}
          <div className="flex justify-between"><span>Orçamentos essenciais</span><strong>{b.orcamentosEssenciais?.formatted ?? '—'}</strong></div>
          <div className="flex justify-between"><span>Metas e reservas</span><strong>{b.metasEReservas?.formatted ?? '—'}</strong></div>
          <div className="flex justify-between"><span>Margem ({b.margemDeSeguranca?.percent ?? 0}%)</span><strong>{b.margemDeSeguranca?.formatted ?? '—'}</strong></div>
          <div className="mt-2 flex justify-between rounded-xl bg-emerald-50 p-2 text-sm font-bold text-emerald-700"><span>Livre</span><span>{b.livre?.formatted ?? data.free ?? '—'}</span></div>
          {b.livre?.isNegative && <p className="text-red-600">Déficit {b.livre?.deficit ?? ''}</p>}
          <small className="text-muted">{data.explicacao ?? data.period?.label ?? ''}</small>
        </div>
      </div>
    )
  }
  return (
    <div className="ai-card">
      <div className="ai-card-header"><Wallet size={16} className={data.isNegative ? 'text-red-600' : 'text-emerald-600'}/> <strong>Dinheiro livre</strong> <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${data.isNegative ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{data.isNegative ? `Déficit ${data.deficit}` : data.free}</span></div>
      <div className="ai-card-body text-xs">
        <div className="flex justify-between"><span>Saldo</span><strong>{data.total}</strong></div>
        <div className="flex justify-between"><span>Comprometido</span><span>{data.committed}</span></div>
        {data.essentialBudgets && <div className="flex justify-between"><span>Orçamentos</span><span>{data.essentialBudgets}</span></div>}
        {data.goals && <div className="flex justify-between"><span>Metas</span><span>{data.goals}</span></div>}
        <div className="flex justify-between"><span>Margem</span><span>{data.safetyMargin ?? '—'}</span></div>
        <div className="mt-2 text-sm">{data.message}</div>
        <small className="text-muted">{data.period?.label ?? ''} • {data.period?.start ?? ''} → {data.period?.end ?? ''}</small>
      </div>
    </div>
  )
}

export function AiCommittedCard({ data }: { data:any }) {
  if (!data) return null
  return (
    <div className="ai-card">
      <div className="ai-card-header"><ReceiptText size={16} className="text-brand"/> <strong>Comprometido</strong></div>
      <div className="ai-card-body text-xs">
        <div className="flex justify-between"><span>Total</span><strong>{data.committed ?? data.total ?? '—'}</strong></div>
        {data.details?.slice(0,4).map((d:any,i:number)=> <div key={i} className="flex justify-between"><span>{d.nome ?? d.name} {d.estimado==='Estimado' ? '• Estimado' : ''}</span><span>{d.valor ?? d.amount ?? ''}</span></div>)}
        <small className="text-muted">{data.period?.label ?? `${data.period?.start ?? ''} → ${data.period?.end ?? ''}`}</small>
      </div>
    </div>
  )
}

export function ToolResultRenderer({ name, result, onApplyPlan, onCancelPlan, onUndo }: { name:string; result:any; onApplyPlan?:(id:string)=>void | Promise<void>; onCancelPlan?:(id?:string)=>void | Promise<void>; onUndo?:(id:string)=>void }) {
  if (!result) return null
  if (result.success===false && result.error) {
    return <div className="ai-card ai-error"><small>{result.error}</small></div>
  }
  // map tool to card
  if (name==='createTransaction' || name==='updateTransaction') return <AiTransactionCard data={result} onUndo={onUndo}/>
  if (name.includes('Recurring')) return <AiRecurringCard data={result}/>
  if (name.includes('Budget')) return <AiBudgetCard data={result}/>
  if (name.includes('Goal')) return <AiGoalCard data={result}/>
  if (name==='getSafeDailySpend' || name==='simulateDailySpend') return <AiSafeDailyCard data={result}/>
  if (name==='getFreeMoney' || name==='getFreeMoneyBreakdown') return <AiFreeMoneyCard data={result}/>
  if (name==='getCommittedAmount') return <AiCommittedCard data={result}/>
  if (name==='preparePaymentAllocationPlan' || name==='getPaymentAllocationPlan') return <AiPaymentPlanCard data={result} onApply={id=> onApplyPlan?.(id)} onCancel={id=> onCancelPlan?.(id)}/>
  if (name==='applyPaymentAllocationPlan' || name==='cancelPaymentAllocationPlan' || name==='updatePaymentAllocationItem') return <AiPaymentPlanCard data={result} onApply={id=> onApplyPlan?.(id)} onCancel={id=> onCancelPlan?.(id)}/>
  if (name==='createAllocationPlan') return <AiPlanCard data={result} onApply={id=> onApplyPlan?.(id)} onCancel={()=> onCancelPlan?.()}/>
  if (name==='getSpendingAnalysis' || name==='getSpendingAnomalies' || name==='getFinancialSummary' || name==='getCashFlowForecast') return <AiAnalysisCard data={result}/>
  if (name==='getAvailableMoney') return <AiAnalysisCard data={{ totalFormatted: result.availableFormatted ?? result.committedFormatted, breakdown: result.breakdown ?? [], ...result }}/>
  // fallback genérico removido: não expor JSON bruto ao usuário (segurança/UX)
  // ferramentas de leitura já são visualizadas via AiVisualRenderer quando há blocks
  // se chegou aqui sem block, não renderiza nada em vez de vazar estrutura interna
  return null
}
