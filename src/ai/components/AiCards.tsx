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

export function ToolResultRenderer({ name, result, onApplyPlan, onCancelPlan, onUndo }: { name:string; result:any; onApplyPlan?:(id:string)=>void; onCancelPlan?:()=>void; onUndo?:(id:string)=>void }) {
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
  if (name==='createAllocationPlan') return <AiPlanCard data={result} onApply={id=> onApplyPlan?.(id)} onCancel={()=> onCancelPlan?.()}/>
  if (name==='getSpendingAnalysis' || name==='getSpendingAnomalies' || name==='getFinancialSummary' || name==='getCashFlowForecast') return <AiAnalysisCard data={result}/>
  if (name==='getAvailableMoney' || name==='getCommittedAmount') return <AiAnalysisCard data={{ totalFormatted: result.availableFormatted ?? result.committedFormatted, breakdown: result.breakdown ?? [], ...result }}/>
  // fallback generic
  if (typeof result==='object') {
    return <div className="ai-card ai-generic"><pre className="ai-json">{JSON.stringify(result, null, 2).slice(0, 900)}</pre></div>
  }
  return null
}
