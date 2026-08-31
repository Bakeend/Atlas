import { useState } from 'react'
import { CalendarClock, ShieldCheck, Wallet, Eye, EyeOff, Calculator } from 'lucide-react'
import { Card, MoneyInput, SelectMenu } from './components'
import { accountBalance, money, parseMoney } from './domain'
import { useFinanceStore } from './store'
import { calculateSafeDailySpend, simulateDailySpend } from './services/financialEngine'

function ProgressBar({ percent, status }: { percent: number; status: string }) {
  const color = status === 'over' || status === 'negative_free' ? 'bg-red-500' : status === 'near_limit' || status === 'reached' ? 'bg-amber-500' : 'bg-emerald-500'
  const bg = status === 'over' ? 'bg-red-100' : status === 'near_limit' ? 'bg-amber-100' : 'bg-emerald-50'
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full ${bg}`}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

export function DailySpendCard() {
  const { hideBalances, safetyMarginPercent } = useFinanceStore() as any
  // calcula a cada render; o store subscription garante re-render quando transações mudam
  const d = calculateSafeDailySpend()

  const [showCalc, setShowCalc] = useState(false)
  const [showToday, setShowToday] = useState(false)

  // status message
  let statusText = ''
  let statusTone = 'text-ink'
  if (d.status === 'no_income') statusText = 'Cadastre seu próximo recebimento para calcular um limite diário mais preciso.'
  else if (d.status === 'negative_free') statusText = 'Seu dinheiro livre está negativo. Ajuste seu planejamento.'
  else if (d.status === 'over') statusText = `Você ultrapassou o valor recomendado de hoje em ${money(Math.abs(d.remainingTodayInCents ?? 0), hideBalances)}.`
  else if (d.status === 'reached') statusText = 'Você atingiu o valor recomendado para hoje.'
  else if (d.status === 'near_limit') statusText = `Restam ${money(d.remainingTodayInCents ?? 0, hideBalances)} hoje.`
  else statusText = d.remainingTodayInCents !== null ? `${money(d.remainingTodayInCents, hideBalances)} disponíveis hoje` : ''

  const mainValue = d.remainingTodayInCents !== null ? d.remainingTodayInCents : d.safeDailySpendInCents
  const mainFormatted = mainValue !== null ? money(mainValue, hideBalances) : '—'
  const progressPercent = d.percentUsed ?? 0
  const progressStatus = d.status

  return (
    <>
      <Card className="dashboard-card daily-spend-card !p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Wallet size={15} /></span>
            <div>
              <h2 className="text-sm font-semibold leading-none">Hoje</h2>
              <p className="mt-0.5 text-xs text-muted">{d.hasNextIncome ? `${d.daysUntilNextIncome} dias até receber` : 'Sem recebimento'}</p>
            </div>
          </div>
          <button className="text-xs font-semibold text-brand" onClick={() => setShowCalc(true)}>Detalhes</button>
        </div>

        {!d.hasNextIncome ? (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
            Cadastre seu salário para ver o limite diário.
          </div>
        ) : (
          <>
            <p className={`mt-3 text-2xl font-bold tracking-tight tabular-nums ${progressStatus === 'over' || progressStatus === 'negative_free' ? 'text-red-600' : progressStatus === 'near_limit' ? 'text-amber-600' : 'text-emerald-600'}`}>{mainFormatted}</p>
            <p className="mt-1 text-xs text-muted">{statusText}</p>

            {d.safeDailySpendInCents !== null && d.safeDailySpendInCents > 0 && (
              <div className="mt-3">
                <ProgressBar percent={progressPercent} status={progressStatus} />
                <div className="mt-1.5 flex justify-between text-[11px] text-muted">
                  <span>{money(d.spentTodayInCents, hideBalances)} / {money(d.safeDailySpendInCents, hideBalances)}</span>
                  <span>{progressPercent}%</span>
                </div>
              </div>
            )}

            {showToday && <TodayCenter data={d} />}
            <button className="mt-3 text-xs font-medium text-muted hover:text-ink" onClick={() => setShowToday(v => !v)}>{showToday ? 'Ocultar' : 'Ver hoje'}</button>
          </>
        )}
      </Card>

      {showCalc && <CalcModal data={d} close={() => setShowCalc(false)} />}
    </>
  )
}

function TodayCenter({ data }: { data: ReturnType<typeof calculateSafeDailySpend> }) {
  const { hideBalances } = useFinanceStore() as any
  return (
    <div className="mt-4 rounded-2xl border bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Eye size={16} className="text-brand" /> Hoje</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-emerald-50 p-3">
          <span className="text-muted">Disponível hoje</span>
          <strong className="mt-1 block text-base tabular-nums text-emerald-700">{data.remainingTodayFormatted ? data.remainingTodayFormatted : data.safeDailyFormatted ?? '—'}</strong>
          <small className="text-muted">{data.spentTodayFormatted} já gastos</small>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <span className="text-muted">Dinheiro livre</span>
          <strong className="mt-1 block text-base tabular-nums">{money(data.freeMoneyInCents, hideBalances)}</strong>
          <small className="text-muted">{data.daysUntilNextIncome} dias até {data.nextIncomeName ?? 'próximo recebimento'}</small>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <span className="text-muted">Próxima conta</span>
          <strong className="mt-1 block truncate text-sm">{data.nextBill ? data.nextBill.name : '—'}</strong>
          <small className="text-muted">{data.nextBill ? `${data.nextBill.date} — ${data.nextBill.amountFormatted}` : 'Nenhuma'}</small>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <span className="text-muted">Próximo recebimento</span>
          <strong className="mt-1 block truncate text-sm">{data.nextIncomeName ?? '—'}</strong>
          <small className="text-muted">{data.nextIncomeDate ? `${data.daysUntilNextIncome} dias — ${data.nextIncomeFormatted}` : '—'}</small>
        </div>
      </div>
    </div>
  )
}

function CalcModal({ data, close }: { data: ReturnType<typeof calculateSafeDailySpend>; close: () => void }) {
  const { hideBalances, safetyMarginPercent, setSafetyMarginPercent } = useFinanceStore() as any
  const [sim, setSim] = useState('')
  const parsedSim = parseMoney(sim)
  const simResult = parsedSim > 0 ? simulateDailySpend(parsedSim) : null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Como calculamos</h2>
          <button className="rounded-full p-2 hover:bg-slate-100" onClick={close}><EyeOff size={18} /></button>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Dinheiro livre</span><strong>{money(data.freeMoneyInCents, hideBalances)}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Comprometido até {data.nextIncomeDate ?? '30 dias'}</span><strong>-{money((() => { const s = useFinanceStore.getState() as any; const total = s.accounts.filter((a:any)=>!a.archived).reduce((sum:number,a:any)=> sum + accountBalance(a, s.transactions.filter((t:any)=>!t.deletedAt)),0); return total - data.freeMoneyInCents })(), hideBalances)}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Margem de segurança ({data.safetyMarginPercent}%)</span><strong>-{money(data.safetyReserveInCents, hideBalances)}</strong></div>
          <div className="flex items-center gap-2">
            <span className="text-muted">Ajustar margem</span>
            <div className="flex-1"><SelectMenu ariaLabel="Ajustar margem de segurança" value={String(safetyMarginPercent)} onChange={v => setSafetyMarginPercent(Number(v))} options={[0,5,10,15,20,30].map(v => ({ value: String(v), label: `${v}%` }))} /></div>
          </div>
          <div className="flex justify-between"><span className="text-muted">Distribuível</span><strong>{money(data.distributableInCents, hideBalances)}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Dias até próximo recebimento</span><strong>{data.daysUntilNextIncome ?? 30} dias {data.nextIncomeDate ? `(${data.nextIncomeDate})` : '(estimativa)'}</strong></div>
          <div className="flex justify-between border-t pt-3"><span className="font-semibold">Limite diário</span><strong className="text-brand">{data.safeDailyFormatted ?? '—'}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Já gasto hoje (sem reservas)</span><strong>{money(data.spentTodayInCents, hideBalances)}</strong></div>
          <div className="flex justify-between"><span className="font-semibold">Restante hoje</span><strong className={data.status === 'over' ? 'text-red-600' : 'text-emerald-600'}>{data.remainingTodayFormatted ?? '—'}</strong></div>
          {data.nextBill && <div className="rounded-xl bg-slate-50 p-3 text-xs"><strong>Próxima conta:</strong> {data.nextBill.name} — {data.nextBill.amountFormatted} em {data.nextBill.date}</div>}
          {data.nextIncomeDate && <div className="rounded-xl bg-blue-50 p-3 text-xs"><strong>Próximo recebimento:</strong> {data.nextIncomeName} — {data.nextIncomeFormatted} em {data.nextIncomeDate}</div>}
          <p className="text-xs leading-5 text-muted">Gastos classificados como <strong>reservados</strong> (ex: Aluguel com recorrência) não consomem o limite diário, pois já estão descontados do dinheiro livre. <strong>Essenciais</strong> (Alimentação, Transporte) e <strong>discricionários</strong> (Lazer, Restaurante) consomem.</p>
          <p className="text-xs leading-5 text-muted">Se você gastar menos hoje, o valor não usado volta para o distribuível e aumenta o limite dos próximos dias automaticamente.</p>
        </div>

        <div className="mt-6 rounded-2xl border bg-slate-50 p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Calculator size={16} /> Simular gasto de hoje</h3>
          <p className="mt-1 text-xs text-muted">Não registra despesa, só simula.</p>
          <div className="mt-3">
            <MoneyInput ariaLabel="Valor da simulação" value={sim} onChange={setSim} />
          </div>
          {simResult && (
            <div className="mt-3 space-y-2 rounded-xl bg-white p-3 text-xs">
              <div className="flex justify-between"><span>Dinheiro livre</span><span>{simResult.freeBeforeFormatted} → {simResult.freeAfterFormatted}</span></div>
              <div className="flex justify-between"><span>Novo limite médio</span><strong>{simResult.newDailyFormatted}/dia</strong></div>
              <div className="flex justify-between"><span>Dias restantes</span><span>{simResult.daysAfter} dias</span></div>
              <div className="flex justify-between"><span>Próximo pagamento</span><span>{simResult.nextIncomeDate ?? '—'}</span></div>
            </div>
          )}
        </div>

        <button className="btn-primary mt-6 w-full" onClick={close}>Fechar</button>
      </div>
    </div>
  )
}
