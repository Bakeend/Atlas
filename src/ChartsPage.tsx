import {
  ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight,
  PieChart as PieIcon, Wallet, Sparkles, Calendar, Layers, Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Card } from './components'
import { currentMonth, money, today } from './domain'
import {
  calculateExpenseView,
  calculateIncomeView,
  calculateMonthlyExpenseView,
  calculateMonthlyIncomeView,
} from './financialView'
import { getCategoryIcon } from './lib/categoryIcons'
import { useResolvedTheme } from './lib/theme'
import { useFinanceStore } from './store'

const PIE_COLORS = [
  '#2F80ED', '#16A36A', '#F2B323', '#9367E9', '#EC4899',
  '#06B6D4', '#F97316', '#8B5CF6', '#10B981', '#64748B',
]

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 15)
  const formatted = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function shortMoney(value: number) {
  if (value >= 100000) return `R$ ${Math.round(value / 100000)}k`
  if (value >= 100) return `R$ ${Math.round(value / 100)}`
  return 'R$ 0'
}

function addMonths(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1 + offset, 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

export function ChartsPage() {
  const { transactions, recurringExpenses, recurringIncomes, customCategoryIcons, hideBalances } = useFinanceStore()
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentMonth())

  const isDark = useResolvedTheme() === 'dark'
  const gridColor = isDark ? '#334155' : '#E9EDF3'
  const tickColor = isDark ? '#94A3B8' : '#7A8392'

  const live = useMemo(() => transactions.filter(t => !t.deletedAt), [transactions])
  const monthExpenseView = useMemo(
    () => calculateMonthlyExpenseView(live, recurringExpenses, selectedMonth),
    [live, recurringExpenses, selectedMonth]
  )
  const monthIncomeView = useMemo(
    () => calculateMonthlyIncomeView(live, recurringIncomes, selectedMonth),
    [live, recurringIncomes, selectedMonth]
  )

  const totalIncome = monthIncomeView.projectedCents
  const totalExpense = monthExpenseView.projectedCents
  const realizedExpense = monthExpenseView.realizedCents
  const committedExpense = monthExpenseView.committedCents
  const realizedIncome = monthIncomeView.realizedCents
  const committedIncome = monthIncomeView.committedCents
  const netBalance = totalIncome - totalExpense
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netBalance / totalIncome) * 100)) : 0

  const prevMonthKey = addMonths(selectedMonth, -1)
  const prevExpenseView = useMemo(
    () => calculateMonthlyExpenseView(live, recurringExpenses, prevMonthKey),
    [live, recurringExpenses, prevMonthKey]
  )
  const prevExpense = prevExpenseView.projectedCents
  const expenseChange = prevExpense ? Math.round(((totalExpense - prevExpense) / prevExpense) * 100) : 0

  const categoryData = useMemo(() => {
    return monthExpenseView.byCategory.map((item, index) => ({
      name: item.category,
      value: item.projectedCents,
      realized: item.realizedCents,
      committed: item.committedCents,
      percent: totalExpense > 0 ? Math.round((item.projectedCents / totalExpense) * 100) : 0,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }))
  }, [monthExpenseView, totalExpense])

  const historicalData = useMemo(() => {
    const list = []
    for (let i = 5; i >= 0; i--) {
      const monthKey = addMonths(selectedMonth, -i)
      const [year, month] = monthKey.split('-').map(Number)
      const date = new Date(year, month - 1, 15)
      const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '')
      const income = calculateMonthlyIncomeView(live, recurringIncomes, monthKey)
      const expense = calculateMonthlyExpenseView(live, recurringExpenses, monthKey)
      list.push({
        key: monthKey,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        Receitas: income.projectedCents,
        Despesas: expense.projectedCents,
        Saldo: income.projectedCents - expense.projectedCents,
      })
    }
    return list
  }, [live, recurringExpenses, recurringIncomes, selectedMonth])

  const dailyFlowData = useMemo(() => {
    const totalDays = daysInMonth(selectedMonth)
    let cumulativeExpense = 0
    let cumulativeIncome = 0
    const list = []

    for (let day = 1; day <= totalDays; day++) {
      const date = `${selectedMonth}-${String(day).padStart(2, '0')}`
      const expense = calculateExpenseView({ transactions: live, recurringExpenses, startDate: date, endDate: date })
      const income = calculateIncomeView({ transactions: live, recurringIncomes, startDate: date, endDate: date })
      cumulativeExpense += expense.projectedCents
      cumulativeIncome += income.projectedCents
      list.push({
        day: `Dia ${day}`,
        Receitas: cumulativeIncome,
        Despesas: cumulativeExpense,
        Saldo: cumulativeIncome - cumulativeExpense,
        isProjected: expense.committedCents > 0 || income.committedCents > 0,
      })
    }
    return list
  }, [selectedMonth, live, recurringExpenses, recurringIncomes])

  const topCategory = categoryData[0]
  const avgDailySpend = useMemo(() => {
    const isCurrent = selectedMonth === currentMonth()
    const divisor = isCurrent ? Math.max(1, Number(today().slice(8, 10))) : daysInMonth(selectedMonth)
    return Math.round(realizedExpense / divisor)
  }, [selectedMonth, realizedExpense])

  const isCurrentMonthView = selectedMonth === currentMonth()

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Visão Analítica</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Gráficos & Projeções</h1>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm">
          <button type="button" onClick={() => setSelectedMonth(m => addMonths(m, -1))} className="grid h-8 w-8 place-items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 active:scale-95" aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <span className="min-w-[140px] text-center text-sm font-bold text-ink">{formatMonthLabel(selectedMonth)}</span>
          <button type="button" onClick={() => setSelectedMonth(m => addMonths(m, 1))} className="grid h-8 w-8 place-items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 active:scale-95" aria-label="Próximo mês"><ChevronRight size={18} /></button>
          {!isCurrentMonthView && <button type="button" onClick={() => setSelectedMonth(currentMonth())} className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand transition-colors hover:bg-blue-100">Hoje</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted"><span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><ArrowDownLeft size={14} /></span><span>Receitas projetadas</span></div>
          <p className="mt-2 text-lg font-bold tabular-nums text-emerald-600 sm:text-xl">{money(totalIncome, hideBalances)}</p>
          <span className="mt-1 block text-[11px] text-muted">Realizado {money(realizedIncome, hideBalances)} • a receber {money(committedIncome, hideBalances)}</span>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted"><span className="grid h-6 w-6 place-items-center rounded-lg bg-red-50 text-red-600"><ArrowUpRight size={14} /></span><span>Despesas projetadas</span></div>
          <p className="mt-2 text-lg font-bold tabular-nums text-red-600 sm:text-xl">{money(totalExpense, hideBalances)}</p>
          <span className="mt-1 block text-[11px] text-muted">Realizado {money(realizedExpense, hideBalances)} • comprometido {money(committedExpense, hideBalances)}</span>
          {expenseChange !== 0 && <span className="mt-1 block text-[11px] font-semibold text-muted">{expenseChange > 0 ? `+${expenseChange}%` : `${expenseChange}%`} vs mês ant.</span>}
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted"><span className="grid h-6 w-6 place-items-center rounded-lg bg-blue-50 text-brand"><Wallet size={14} /></span><span>Resultado projetado</span></div>
          <p className={`mt-2 text-lg font-bold tabular-nums sm:text-xl ${netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(netBalance, hideBalances)}</p>
          <span className="mt-1 block text-[11px] font-semibold text-muted">{netBalance >= 0 ? 'Saldo positivo' : 'Déficit no mês'}</span>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted"><span className="grid h-6 w-6 place-items-center rounded-lg bg-purple-50 text-purple-600"><Sparkles size={14} /></span><span>Taxa de Poupança</span></div>
          <p className="mt-2 text-lg font-bold tabular-nums text-purple-600 sm:text-xl">{savingsRate}%</p>
          <span className="mt-1 block text-[11px] font-semibold text-muted">sobre renda projetada</span>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div><h2 className="text-base font-bold text-ink sm:text-lg">Distribuição por Categoria</h2><p className="mt-0.5 text-xs text-muted">Realizado + compromissos ainda não pagos em {formatMonthLabel(selectedMonth)}</p></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{categoryData.length} categorias</span>
        </div>
        {categoryData.length > 0 ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-center">
            <div className="relative mx-auto h-[240px] w-full max-w-[280px] lg:col-span-5">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius="65%" outerRadius="92%" paddingAngle={3} strokeWidth={2} stroke="#ffffff">
                    {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(val: any) => [money(Number(val) || 0, hideBalances), 'Projetado']} contentStyle={{ borderRadius: '14px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"><span className="text-[11px] font-medium uppercase tracking-wider text-muted">Total projetado</span><strong className="mt-0.5 text-lg font-bold text-ink sm:text-xl">{money(totalExpense, hideBalances)}</strong></div>
            </div>
            <div className="space-y-3 lg:col-span-7">
              {categoryData.map(item => {
                const Icon = getCategoryIcon(item.name, customCategoryIcons)
                return (
                  <div key={item.name} className="flex flex-col gap-1.5 rounded-xl bg-slate-50/80 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-xs" style={{ backgroundColor: item.color }}><Icon size={16} /></span><span className="truncate font-semibold text-ink">{item.name}</span></div>
                      <div className="flex shrink-0 items-center gap-3"><span className="text-xs font-bold tabular-nums text-muted">{item.percent}%</span><strong className="text-sm font-bold tabular-nums text-ink">{money(item.value, hideBalances)}</strong></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted"><span>Realizado {money(item.realized, hideBalances)}</span><span>Comprometido {money(item.committed, hideBalances)}</span></div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${item.percent}%`, backgroundColor: item.color }} /></div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : <div className="my-10 text-center text-muted"><PieIcon size={36} className="mx-auto mb-2 opacity-40" /><p className="text-sm font-medium">Nenhuma despesa realizada ou comprometida em {formatMonthLabel(selectedMonth)}.</p></div>}
      </Card>

      <Card className="p-5 sm:p-6">
        <div><h2 className="text-base font-bold text-ink sm:text-lg">Comparativo dos Últimos 6 Meses</h2><p className="mt-0.5 text-xs text-muted">Realizado + compromissos ainda abertos</p></div>
        <div className="mt-6 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={historicalData} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 12 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} tickFormatter={shortMoney} width={56} />
              <Tooltip formatter={(value: any, name: any) => [money(Number(value) || 0, hideBalances), name]} contentStyle={{ borderRadius: '14px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Bar dataKey="Receitas" fill="#16A36A" radius={[6, 6, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Despesas" fill="#2F80ED" radius={[6, 6, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-ink sm:text-lg">Fluxo Acumulado & Projeção Diária</h2><p className="mt-0.5 text-xs text-muted">Movimentações realizadas e recorrências ainda abertas, na data correta de cada ocorrência</p></div>{isCurrentMonthView && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand">Com projeção</span>}</div>
        <div className="mt-6 h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyFlowData} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
              <defs><linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16A36A" stopOpacity={0.2} /><stop offset="95%" stopColor="#16A36A" stopOpacity={0.01} /></linearGradient><linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2F80ED" stopOpacity={0.2} /><stop offset="95%" stopColor="#2F80ED" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} interval={4} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} tickFormatter={shortMoney} width={56} />
              <Tooltip formatter={(value: any, name: any) => [money(Number(value) || 0, hideBalances), name]} contentStyle={{ borderRadius: '14px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area type="monotone" dataKey="Receitas" stroke="#16A36A" strokeWidth={2.5} fill="url(#colorReceitas)" />
              <Area type="monotone" dataKey="Despesas" stroke="#2F80ED" strokeWidth={2.5} fill="url(#colorDespesas)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand"><Layers size={16} /><span>Maior Centro de Custo</span></div>
          {topCategory ? <div className="mt-2"><p className="truncate text-base font-bold text-ink">{topCategory.name}</p><p className="text-xs text-muted">{money(topCategory.value, hideBalances)} ({topCategory.percent}% do projetado)</p></div> : <p className="mt-2 text-xs text-muted">Sem despesas registradas.</p>}
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-600"><Zap size={16} /><span>Média Diária Realizada</span></div>
          <div className="mt-2"><p className="text-base font-bold text-ink">{money(avgDailySpend, hideBalances)} / dia</p><p className="text-xs text-muted">Somente o que efetivamente saiu da conta</p></div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600"><Calendar size={16} /><span>Resultado Projetado do Mês</span></div>
          <div className="mt-2"><p className={`text-base font-bold ${netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(netBalance, hideBalances)}</p><p className="text-xs text-muted">{netBalance >= 0 ? 'Fechamento previsto no azul' : 'Fechamento previsto no vermelho'}</p></div>
        </Card>
      </div>
    </div>
  )
}
