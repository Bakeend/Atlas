import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CategoryIcon } from './components'
import { accountBalance, money, today } from './domain'
import { calculateForecast, getAverageDailyVariable, summarizeForecast, type ForecastPoint } from './forecast/calculate'
import { useFinanceStore } from './store'

function shortMoney(value: number) {
  return value >= 100000 ? `R$ ${Math.round(value / 100000)}k` : value ? `R$ ${Math.round(value / 100)}` : 'R$ 0'
}

function ForecastTooltip({ active, payload, label, hidden }: { active?: boolean; payload?: Array<{ payload: ForecastPoint }>; label?: string; hidden: boolean }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="chart-tooltip">
      <span>{label} • {p.date}</span>
      <strong>{money(p.balance, hidden)}</strong>
      <span className="text-[11px]">{p.recurringCents ? `Recorrentes: -${money(p.recurringCents, hidden)}` : 'Sem recorrentes'} {p.variableCents !== 0 ? `• Prev. diário: ${p.variableCents > 0 ? '+' : ''}${money(p.variableCents, hidden)}` : ''}</span>
    </div>
  )
}

export function ForecastDashboardCard() {
  const { accounts, transactions, recurringExpenses, forecastRealistic, hideBalances } = useFinanceStore()
  const live = transactions.filter(t => !t.deletedAt)
  const total = accounts.filter(a => !a.archived).reduce((s, acc) => s + accountBalance(acc, live), 0)
  const points = useMemo(() => calculateForecast({ accounts, transactions, recurringExpenses, startDate: today(), days: 30, realistic: forecastRealistic }), [accounts, transactions, recurringExpenses, forecastRealistic])
  const summary = useMemo(() => summarizeForecast(points, total), [points, total])
  const delta = summary.endBalance - total
  const isNegative = summary.minBalance < 0
  const riskyDate = points.find(p => p.balance < 0)?.date

  return (
    <Card className="dashboard-card">
      <div className="card-heading">
        <div>
          <h2>Previsão de saldo</h2>
          <p className="mt-1 text-xs text-muted">{forecastRealistic ? 'Realista' : 'Só recorrentes'} • 30 dias</p>
        </div>
        <NavLink to="/forecast">Ver</NavLink>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <span className="block text-xs text-muted">Saldo em 30 dias</span>
          <strong className={`mt-1 block text-base tabular-nums ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(summary.endBalance, hideBalances)}</strong>
          <span className={`mt-1 block text-xs font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(Math.abs(delta), hideBalances)} vs hoje</span>
        </div>
        <div className={`rounded-xl p-3 ${isNegative ? 'bg-red-50' : 'bg-blue-50/60'}`}>
          <span className="block text-xs text-muted">{isNegative ? 'Alerta' : 'Menor saldo'}</span>
          <strong className={`mt-1 block text-base tabular-nums ${isNegative ? 'text-red-600' : 'text-ink'}`}>{money(summary.minBalance, hideBalances)}</strong>
          <span className="text-xs text-muted">{isNegative && riskyDate ? `Negativa em ${riskyDate}` : 'Sem risco no período'}</span>
        </div>
      </div>
      <div className="mt-4 h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastDash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2F80ED" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#2F80ED" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E9EDF3" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#7A8392', fontSize: 11 }} interval={Math.floor(points.length / 5)} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8A93A1', fontSize: 11 }} tickFormatter={shortMoney} width={56} />
            <Tooltip content={<ForecastTooltip hidden={hideBalances} />} />
            <ReferenceLine y={0} stroke="#DC2626" strokeDasharray="3 3" />
            <Area type="monotone" dataKey="balance" stroke="#2F80ED" strokeWidth={2.5} fill="url(#forecastDash)" dot={false} activeDot={{ r: 4, fill: '#fff', stroke: '#2F80ED', strokeWidth: 2.5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex gap-2 text-xs text-muted">
        <span>Recorrentes 30d: -{money(summary.totalRecurring, hideBalances)}</span>
        {forecastRealistic && <span>• Variável previsto: {summary.totalVariable >= 0 ? '+' : ''}{money(summary.totalVariable, hideBalances)}</span>}
      </div>
    </Card>
  )
}

export function ForecastPage() {
  const navigate = useNavigate()
  const { accounts, transactions, recurringExpenses, forecastRealistic, setForecastRealistic, hideBalances } = useFinanceStore()
  const [days, setDays] = useState<30 | 90>(30)
  const live = transactions.filter(t => !t.deletedAt)
  const total = accounts.filter(a => !a.archived).reduce((s, acc) => s + accountBalance(acc, live), 0)
  const avg = useMemo(() => getAverageDailyVariable(transactions, today()), [transactions])
  const points = useMemo(() => calculateForecast({ accounts, transactions, recurringExpenses, startDate: today(), days, realistic: forecastRealistic }), [accounts, transactions, recurringExpenses, days, forecastRealistic])
  const summary = useMemo(() => summarizeForecast(points, total), [points, total])
  const firstNegative = points.find(p => p.balance < 0)

  return (
    <>
      <div className="page-title">
        <div>
          <button onClick={() => navigate('/')} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ChevronLeft size={17}/>Início</button>
          <h1>Previsão de saldo</h1>
          <span className="mt-2 block max-w-md text-xs leading-5 text-muted sm:text-sm">Simula seu saldo dia a dia. Alterne entre Realista e Só fixos abaixo.</span>
        </div>
        <Wallet className="hidden text-brand sm:block" size={28} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <CategoryIcon icon={Wallet} color="#2F80ED" backgroundColor="#E8F1FE" size={20} className="mx-auto mb-2" />
          <span className="block text-xs text-muted">Hoje</span><strong className="mt-1 block text-lg tabular-nums">{money(total, hideBalances)}</strong>
        </Card>
        <Card className="p-4 text-center">
          <CategoryIcon icon={summary.endBalance >= total ? ArrowDownLeft : ArrowUpRight} color={summary.endBalance >= total ? '#16A36A' : '#DC2626'} backgroundColor={summary.endBalance >= total ? '#E5F8EF' : '#FEECEC'} size={20} className="mx-auto mb-2" />
          <span className="block text-xs text-muted">Em {days} dias</span><strong className={`mt-1 block text-lg tabular-nums ${summary.endBalance >= total ? 'text-emerald-600' : 'text-red-600'}`}>{money(summary.endBalance, hideBalances)}</strong><small className={`mt-1 block text-xs font-semibold ${summary.endBalance >= total ? 'text-emerald-600' : 'text-red-600'}`}>{money(Math.abs(summary.endBalance - total), hideBalances)}</small>
        </Card>
        <Card className={`p-4 text-center ${firstNegative ? 'border-red-200 bg-red-50/50' : ''}`}>
          <CategoryIcon icon={firstNegative ? ArrowUpRight : ArrowDownLeft} color={firstNegative ? '#DC2626' : '#16A36A'} backgroundColor={firstNegative ? '#FEECEC' : '#E5F8EF'} size={20} className="mx-auto mb-2" />
          <span className="block text-xs text-muted">Risco</span><strong className={`mt-1 block text-sm ${firstNegative ? 'text-red-600' : 'text-emerald-600'}`}>{firstNegative ? `Negativa em ${firstNegative.date}` : 'Sem risco'}</strong><small className="text-xs text-muted">Mín: {money(summary.minBalance, hideBalances)}</small>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button onClick={() => setDays(30)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${days === 30 ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'}`}>30 dias</button>
            <button onClick={() => setDays(90)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${days === 90 ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'}`}>90 dias</button>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <span className={forecastRealistic ? 'font-semibold text-brand' : 'text-muted'}>Realista</span>
            <button onClick={() => setForecastRealistic(!forecastRealistic)} className={`toggle ${forecastRealistic ? 'active' : ''}`} aria-label="Alternar modo realista"><span/></button>
            <span className={!forecastRealistic ? 'font-semibold text-ink' : 'text-muted'}>Só recorrentes</span>
          </label>
        </div>

        <div className="mt-4 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastFull" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2F80ED" stopOpacity={0.20} />
                  <stop offset="95%" stopColor="#2F80ED" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E9EDF3" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#7A8392', fontSize: 11 }} interval={Math.floor(points.length / 7)} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8A93A1', fontSize: 11 }} tickFormatter={shortMoney} width={62} />
              <Tooltip content={<ForecastTooltip hidden={hideBalances} />} />
              <ReferenceLine y={0} stroke="#DC2626" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="balance" stroke="#2F80ED" strokeWidth={2.5} fill="url(#forecastFull)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="flex items-center gap-1 text-muted"><CategoryIcon icon={ArrowUpRight} color="#DC2626" backgroundColor="#FEECEC" size={14} /> Recorrentes</span><strong className="mt-2 block text-red-600">{money(summary.totalRecurring, hideBalances)}</strong>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="flex items-center gap-1 text-muted"><CategoryIcon icon={summary.totalVariable >= 0 ? ArrowDownLeft : ArrowUpRight} color={summary.totalVariable >= 0 ? '#16A36A' : '#DC2626'} backgroundColor={summary.totalVariable >= 0 ? '#E5F8EF' : '#FEECEC'} size={14} /> Variável previsto</span><strong className={`mt-2 block ${summary.totalVariable >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(summary.totalVariable, hideBalances)}</strong><small className="text-[11px] text-muted">Média {money(Math.abs(avg.avgExpense), hideBalances)}/dia despesa</small>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="flex items-center gap-1 text-muted"><CategoryIcon icon={ArrowDownLeft} color="#16A36A" backgroundColor="#E5F8EF" size={14} /> Receita média</span><strong className="mt-2 block text-emerald-600">{money(avg.avgIncome * days, hideBalances)}</strong><small className="text-[11px] text-muted">{money(avg.avgIncome, hideBalances)}/dia</small>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="flex items-center gap-1 text-muted"><CategoryIcon icon={ArrowLeftRight} color="#2F80ED" backgroundColor="#E8F1FE" size={14} /> Modo</span><strong className="mt-2 block">{forecastRealistic ? 'Realista' : 'Só recorrentes'}</strong><small className="text-[11px] text-muted">{forecastRealistic ? 'Fixos + média 90d' : 'Só fixos'}</small>
          </div>
        </div>
      </Card>

      <Card className="mt-4 !p-0">
        <div className="p-4 pb-2"><h2 className="section-title">Detalhe por dia</h2><p className="mt-1 text-xs text-muted">Toque no gráfico para ver o dia. Primeiros 14 dias:</p></div>
        <div className="divide-y divide-slate-100">
          {points.slice(0, 14).map(p => {
            const isBalanceNegative = p.balance < 0
            return (
              <div key={p.date} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-[74px] text-xs font-medium text-muted">{p.label} • {p.date.slice(8,10)}/{p.date.slice(5,7)}</span>
                <span className={`transaction-amount !px-2 !py-1 text-[11px] ${p.recurringCents ? 'expense' : '!bg-slate-50 !text-slate-500'}`}>{p.recurringCents ? <><ArrowUpRight size={12} strokeWidth={2.4}/>-{money(p.recurringCents, hideBalances)} recorrente</> : '—'}</span>
                <strong className="ml-auto tabular-nums text-sm">{money(p.balance, hideBalances)}</strong>
                <span className={`transaction-amount !px-2 !py-1 text-xs ${isBalanceNegative ? 'expense' : 'income'}`}>{isBalanceNegative ? <ArrowUpRight size={13} strokeWidth={2.4}/> : <ArrowDownLeft size={13} strokeWidth={2.4}/>}{isBalanceNegative ? 'saída' : 'entrada'}</span>
              </div>
            )
          })}
        </div>
        {points.length > 14 && <p className="p-3 text-center text-xs text-muted">Mostrando 14 de {points.length} dias. Gráfico mostra todos.</p>}
      </Card>

      <Card className="mt-4">
        <h3 className="section-title">Como é calculado?</h3>
        <ul className="mt-3 space-y-3 text-xs leading-5 text-muted">
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"></span><span><strong className="text-ink">Só recorrentes:</strong> considera apenas suas contas fixas (aluguel, internet e outras que você cadastrou) e desconta cada vencimento futuro do seu saldo atual de {money(total, hideBalances)}.</span></li>
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"></span><span><strong className="text-ink">Realista:</strong> além das contas fixas, usa sua média do dia a dia dos últimos 3 meses para prever melhor. Hoje isso é cerca de {money(avg.avgExpense, hideBalances)}/dia em despesas e {money(avg.avgIncome, hideBalances)}/dia em receitas variáveis.</span></li>
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"></span><span>Você pode mudar o modo pelos botões acima ou no <NavLink to="/" className="font-semibold text-brand">Dashboard</NavLink> — previsão não fica mais escondida em Perfil.</span></li>
        </ul>
      </Card>
    </>
  )
}
