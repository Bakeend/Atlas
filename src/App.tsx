import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Bell, BellRing, Car, ChartPie, CheckCheck, ChevronRight,
  Eye, EyeOff, FileUp, Gamepad2, House, Package, Plus, Settings, Sparkles,
  TrendingDown, TrendingUp, Utensils, Wallet, X, type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AccountIcon, AccountModal, Card, CategoryIcon, Empty, MoneyInput, PageTitle, SelectMenu, TransactionModal, TransactionRow } from './components'
import { accountBalance, categories, currentMonth, money, parseMoney, today, uid, type FinanceTransaction } from './domain'
import { useFinanceStore } from './store'
import { RecurringExpensesPage } from './RecurringExpenses'
import { ImportPage } from './ImportPage'
import { ForecastPage } from './ForecastPage'
import { AiAssistantPage } from './ai/components/AiAssistantPage'
import { CategoryManager } from './components/CategoryManager'
import { getCategoryIcon } from './lib/categoryIcons'
import { getFinanceNotifications, type FinanceNotification } from './notifications'
import { OrganizePage } from './OrganizePage'
import { ChartsPage } from './ChartsPage'
import { SettingsMenu, NavigationSettings, FinanceSettings, PaymentSettings, PrivacySettings, AppearanceSettings } from './SettingsPages'
import { resolveShortcutItems, APP_PAGES } from './navigation'
import { OnboardingPage } from './OnboardingPage'
import { useResolvedTheme } from './lib/theme'

function Shell() {
  const [newTransaction, setNewTransaction] = useState(false)
  const { hydrate, ready } = useFinanceStore()
  const theme = useFinanceStore(state => state.theme)
  const onboardingDone = useFinanceStore(state => state.onboardingDone)
  const isEmpty = useFinanceStore(state => state.accounts.length === 0 && state.transactions.length === 0 && state.recurringExpenses.length === 0)
  useEffect(() => { void hydrate() }, [hydrate])
  useEffect(() => {
    if (!ready) return
    void import('./lib/theme').then(m => m.syncTheme(theme ?? 'system'))
  }, [theme, ready])
  if (!ready) return <div className="grid min-h-screen place-items-center"><div className="text-center"><div className="mx-auto h-11 w-11 animate-pulse rounded-full bg-brand"/><p className="mt-3 text-sm text-muted">Carregando suas finanças…</p></div></div>
  if (!onboardingDone && isEmpty) return <OnboardingPage/>
  return <div className="min-h-screen"><main className="app-content"><Routes>
    <Route path="/" element={<Dashboard/>}/><Route path="/transactions" element={<Transactions/>}/><Route path="/organizar" element={<OrganizePage/>}/><Route path="/charts" element={<ChartsPage/>}/><Route path="/import" element={<ImportPage/>}/><Route path="/forecast" element={<ForecastPage/>}/><Route path="/accounts" element={<Accounts/>}/><Route path="/planning" element={<Planning/>}/><Route path="/recurring" element={<RecurringExpensesPage/>}/><Route path="/assistant" element={<AiAssistantPage/>}/><Route path="/profile" element={<Profile/>}/><Route path="/settings" element={<SettingsMenu/>}/><Route path="/settings/appearance" element={<AppearanceSettings/>}/><Route path="/settings/nav" element={<NavigationSettings/>}/><Route path="/settings/finance" element={<FinanceSettings/>}/><Route path="/settings/payment" element={<PaymentSettings/>}/><Route path="/settings/privacy" element={<PrivacySettings/>}/><Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></main><BottomNavigation onNew={() => setNewTransaction(true)}/>{newTransaction && <TransactionModal close={() => setNewTransaction(false)}/>}</div>
}

function BottomNavigation({ onNew }: { onNew: () => void }) {
  const shortcuts = useFinanceStore(state => state.navShortcuts)
  const items = resolveShortcutItems(shortcuts)
  return <div className="bottom-nav-shell"><nav className="bottom-nav" aria-label="Navegação principal">
    {items.slice(0, 2).map(item => <BottomNavItem key={item.to} {...item}/>)}
    <button className="bottom-nav-action" onClick={onNew} aria-label="Nova movimentação"><Plus size={29} strokeWidth={2}/></button>
    {items.slice(2).map(item => <BottomNavItem key={item.to} {...item}/>)}
  </nav></div>
}

function BottomNavItem({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return <NavLink end={to === '/'} to={to} className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}><Icon size={22} strokeWidth={1.9}/><span>{label}</span></NavLink>
}

function AiFab() {
  return <NavLink to="/assistant" className="ai-fab" aria-label="Assistente financeiro"><Sparkles size={20}/><span>Assistente</span></NavLink>
}

function Dashboard() {
  const { accounts, transactions, budgets, recurringExpenses, readNotificationIds, markNotificationRead, markAllNotificationsRead, hideBalances, toggleBalances, profileName } = useFinanceStore()
  const isDark = useResolvedTheme() === 'dark'
  const gridColor = isDark ? '#334155' : '#E9EDF3'
  const tickXColor = isDark ? '#94A3B8' : '#7A8392'
  const tickYColor = isDark ? '#94A3B8' : '#8A93A1'
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const live = transactions.filter(transaction => !transaction.deletedAt)
  const month = currentMonth()
  const total = accounts.filter(account => !account.archived).reduce((sum, account) => sum + accountBalance(account, live), 0)
  const income = sumTransactions(live, month, 'income')
  const expense = sumTransactions(live, month, 'expense')
  const previousIncome = sumTransactions(live, monthKey(-1), 'income')
  const previousExpense = sumTransactions(live, monthKey(-1), 'expense')
  const previousBalance = total - (income - expense)
  const balanceTrend = percentageChange(total, previousBalance)
  const [chartPeriod, setChartPeriod] = useState<'3'|'6'|'12'>('6')
  const recent = [...live].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
  const chartData = useMemo(() => lastNMonths(live, Number(chartPeriod)), [live, chartPeriod])
  const budgetData = budgetCategories(live, month)
  const expenseTotal = budgetData.reduce((sum, item) => sum + item.value, 0)
  const hasBudget = budgets.some(budget => budget.month === month)
  const notifications = useMemo(() => getFinanceNotifications({ recurringExpenses, transactions, budgets, referenceDate: today() }), [recurringExpenses, transactions, budgets])
  const unreadNotifications = notifications.filter(notification => !readNotificationIds.includes(notification.id))

  return <>
    <header className="dashboard-header"><div><h1>{profileName ? `Olá, ${profileName}` : 'Olá'} <span aria-hidden="true">👋</span></h1><p>{profileName ? 'Aqui está o resumo das suas finanças' : <span>Aqui está o resumo das suas finanças — <NavLink to="/profile" className="font-semibold text-brand hover:underline">personalizar nome</NavLink></span>}</p></div><div className="flex items-center gap-2"><NavLink to="/assistant" className="ai-header-fab"><Sparkles size={16}/> Assistente</NavLink><button className="notification-button" onClick={() => setNotificationsOpen(true)} aria-label={`Notificações${unreadNotifications.length ? `: ${unreadNotifications.length} não lidas` : ''}`} aria-haspopup="dialog" aria-expanded={notificationsOpen}><Bell size={23} strokeWidth={1.9}/>{unreadNotifications.length > 0 && <span className="notification-dot"/>}</button></div></header>
    {notificationsOpen && <NotificationCenter notifications={notifications} unreadIds={readNotificationIds} close={() => setNotificationsOpen(false)} markRead={markNotificationRead} markAllRead={markAllNotificationsRead}/>}
    <section className="balance-card"><Wallet className="balance-card-watermark" size={94} strokeWidth={1.8}/><div className="relative z-10 flex items-center gap-2"><span className="text-sm font-medium text-white/90">Saldo total</span><button className="balance-eye" onClick={toggleBalances} aria-label={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}>{hideBalances ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div><p className="balance-value">{money(total, hideBalances)}</p><div className="balance-trend">{balanceTrend >= 0 ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}<span>{formatPercent(Math.abs(balanceTrend))} vs mês anterior</span></div></section>
    <section className="summary-grid"><SummaryCard title="Receitas" value={money(income, hideBalances)} trend={percentageChange(income, previousIncome)} icon={ArrowDownLeft} tone="income"/><SummaryCard title="Despesas" value={money(expense, hideBalances)} trend={percentageChange(expense, previousExpense)} icon={ArrowUpRight} tone="expense"/></section>
    <Card className="dashboard-card chart-card"><div className="card-heading"><div><h2>Despesas nos últimos {chartPeriod} meses</h2><NavLink to="/charts" className="mt-0.5 block text-xs font-semibold text-brand hover:underline">Ver gráficos & projeções →</NavLink></div><div className="min-w-[110px]"><SelectMenu ariaLabel="Período do gráfico" value={chartPeriod} onChange={v => setChartPeriod(v as '3'|'6'|'12')} options={[{ value: '3', label: '3 meses' }, { value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]} /></div></div><div className="expense-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 8, left: -14, bottom: 0 }}><defs><linearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2F80ED" stopOpacity={0.18}/><stop offset="95%" stopColor="#2F80ED" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: tickXColor, fontSize: 12 }} dy={9}/><YAxis axisLine={false} tickLine={false} tick={{ fill: tickYColor, fontSize: 11 }} tickFormatter={shortMoney}/><Tooltip content={<ChartTooltip hidden={hideBalances}/>}/><Area type="monotone" dataKey="value" stroke="#2F80ED" strokeWidth={3} fill="url(#expenseArea)" activeDot={{ r: 5, fill: '#fff', stroke: '#2F80ED', strokeWidth: 3 }} dot={{ r: 4, fill: '#fff', stroke: '#2F80ED', strokeWidth: 2.5 }}/></AreaChart></ResponsiveContainer></div></Card>
    <Card className="dashboard-card budget-card"><div className="card-heading"><h2>Orçamento deste mês</h2><NavLink to="/planning">Ver tudo</NavLink></div><div className="budget-layout"><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={expenseTotal ? budgetData : [{ value: 1, color: '#E5E7EB' }]} dataKey="value" innerRadius="64%" outerRadius="91%" paddingAngle={expenseTotal ? 2 : 0} stroke="white" strokeWidth={2}>{(expenseTotal ? budgetData : [{ color: '#E5E7EB' }]).map((entry, index) => <Cell key={index} fill={entry.color}/>)}</Pie></PieChart></ResponsiveContainer><div className="donut-center"><strong>{money(expenseTotal, hideBalances)}</strong><span>Total</span></div></div><div className="budget-list">{budgetData.map(item => <BudgetRow key={item.name} item={item} total={expenseTotal} hidden={hideBalances}/>)}</div></div>{!hasBudget && <p className="budget-note">Defina limites por categoria em Orçamento.</p>}</Card>
    <Card className="dashboard-card recent-card"><div className="card-heading"><h2>Transações recentes</h2><NavLink to="/transactions">Ver todas</NavLink></div><div className="transaction-list">{recent.length ? recent.map(transaction => <TransactionRow item={transaction} key={transaction.id}/>) : <p className="empty-inline">Nenhuma movimentação ainda.</p>}</div></Card>
  </>
}

function NotificationCenter({ notifications, unreadIds, close, markRead, markAllRead }: { notifications: FinanceNotification[]; unreadIds: string[]; close: () => void; markRead: (id: string) => void; markAllRead: (ids: string[]) => void }) {
  const navigate = useNavigate()
  const unread = notifications.filter(item => !unreadIds.includes(item.id))
  const icon = (kind: FinanceNotification['kind']) => kind === 'overdue' || kind === 'budget-exceeded' ? AlertTriangle : kind === 'reminder' ? BellRing : ChartPie
  const openNotification = (notification: FinanceNotification) => {
    markRead(notification.id)
    close()
    navigate(notification.href)
  }
  return <div className="notification-overlay" role="presentation" onMouseDown={close}>
    <section className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notifications-title" onMouseDown={event => event.stopPropagation()}>
      <div className="notification-panel-heading"><div><p>Central de avisos</p><h2 id="notifications-title">Notificações</h2></div><button className="icon-button" onClick={close} aria-label="Fechar notificações"><X size={20}/></button></div>
      {unread.length > 0 && <button className="notification-mark-all" onClick={() => markAllRead(unread.map(item => item.id))}><CheckCheck size={16}/>Marcar todas como lidas</button>}
      <div className="notification-list">{notifications.length ? notifications.map(notification => {
        const Icon = icon(notification.kind)
        const unreadItem = !unreadIds.includes(notification.id)
        return <button key={notification.id} onClick={() => openNotification(notification)} className={`notification-item ${notification.kind} ${unreadItem ? 'unread' : ''}`}><span className="notification-item-icon"><Icon size={19}/></span><span className="notification-item-content"><strong>{notification.title}</strong><small>{notification.message}</small></span>{unreadItem && <span className="notification-unread-dot" aria-label="Não lida"/>}</button>
      }) : <div className="notification-empty"><Bell size={26}/><strong>Tudo em dia</strong><p>Você não tem notificações no momento.</p></div>}</div>
    </section>
  </div>
}

function SummaryCard({ title, value, trend, icon, tone }: { title: string; value: string; trend: number; icon: LucideIcon; tone: 'income' | 'expense' }) {
  const isIncome = tone === 'income'
  const color = isIncome ? '#16A36A' : '#DC2626'
  const background = isIncome ? '#E5F8EF' : '#FEECEC'
  return <Card className="summary-card"><CategoryIcon icon={icon} color={color} backgroundColor={background} className="summary-icon-blue" size={24}/><div className="min-w-0"><p className="summary-title">{title}</p><p className={`summary-value ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>{value}</p><p className={`summary-trend ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>{trend >= 0 ? '+' : '−'} {formatPercent(Math.abs(trend))}</p></div></Card>
}

function BudgetRow({ item, total, hidden }: { item: BudgetCategory; total: number; hidden: boolean }) {
  const percent = total ? Math.round(item.value / total * 100) : 0
  return <div className="budget-row"><CategoryIcon icon={item.icon} color="#fff" backgroundColor={item.color} size={14}/><span className="budget-name">{item.name}</span><strong>{money(item.value, hidden)}</strong><span className="budget-percent">{percent}%</span></div>
}

function ChartTooltip({ active, payload, label, hidden }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string; hidden: boolean }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><span>{label}</span><strong>{money(payload[0].value ?? 0, hidden)}</strong></div>
}

function Transactions() {
  const { transactions, accounts, softDeleteTransaction } = useFinanceStore()
  const [query, setQuery] = useState(''); const [type, setType] = useState('all'); const [account, setAccount] = useState('all'); const [edit, setEdit] = useState<FinanceTransaction>(); const [confirm, setConfirm] = useState<string>(); const [openId, setOpenId] = useState<string | null>(null)
  const list = useMemo(() => transactions.filter(item => !item.deletedAt).filter(item => !query || item.description.toLowerCase().includes(query.toLowerCase())).filter(item => type === 'all' || item.type === type).filter(item => account === 'all' || item.accountId === account).sort((a, b) => b.date.localeCompare(a.date)), [transactions, query, type, account])
  return <><div className="page-title"><div><p>Histórico</p><h1>Transações</h1></div><NavLink to="/import" className="btn-secondary"><FileUp size={16}/> Importar extrato</NavLink></div><Card><div className="filter-grid"><input className="field" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por descrição…"/><SelectMenu ariaLabel="Filtrar por tipo" value={type} onChange={setType} options={[{ value: 'all', label: 'Todos os tipos' }, { value: 'income', label: 'Receitas' }, { value: 'expense', label: 'Despesas' }, { value: 'transfer', label: 'Transferências' }]}/><SelectMenu ariaLabel="Filtrar por conta" value={account} onChange={setAccount} options={[{ value: 'all', label: 'Todas as contas' }, ...accounts.map(item => ({ value: item.id, label: item.name }))]}/></div><div className="transaction-list mt-4">{list.length ? list.map(item => <TransactionRow key={item.id} item={item} isMenuOpen={openId === item.id} onMenuToggle={next => setOpenId(next ? item.id : null)} onEdit={() => { setOpenId(null); setEdit(item) }} onDelete={() => { setOpenId(null); setConfirm(item.id) }}/>) : <p className="empty-inline">Nenhuma movimentação encontrada.</p>}</div></Card>{edit && <TransactionModal item={edit} close={() => setEdit(undefined)}/>} {confirm && <ConfirmDelete close={() => setConfirm(undefined)} confirm={() => { softDeleteTransaction(confirm); setConfirm(undefined) }}/>}</>
}

function Accounts() {
  const { accounts, transactions, hideBalances, updateAccount } = useFinanceStore(); const [modal, setModal] = useState(false); const [edit, setEdit] = useState<typeof accounts[number]>(); const live = transactions.filter(item => !item.deletedAt)
  return <><PageTitle eyebrow="Organização" title="Contas e carteiras"><button className="btn-primary" onClick={() => setModal(true)}>Nova conta</button></PageTitle><div className="grid gap-4 sm:grid-cols-2">{accounts.map(item => <Card key={item.id} className={item.archived ? 'opacity-60' : ''}><div className="flex items-start justify-between"><span style={{ backgroundColor: `${item.color}20`, color: item.color }} className="grid h-11 w-11 place-items-center rounded-xl"><AccountIcon type={item.type}/></span><button onClick={() => setEdit(item)} className="icon-button"><Settings size={17}/></button></div><p className="mt-5 font-semibold">{item.name}</p><p className="mt-1 text-sm text-muted">{item.archived ? 'Arquivada' : accountType(item.type)}</p><p className="mt-4 text-xl font-bold tabular-nums">{money(accountBalance(item, live), hideBalances)}</p><button className="mt-4 text-sm font-semibold text-brand" onClick={() => updateAccount({ ...item, archived: !item.archived })}>{item.archived ? 'Reativar conta' : 'Arquivar conta'}</button></Card>)}</div>{!accounts.length && <Empty title="Adicione sua primeira conta" text="Contas e carteiras ajudam a manter seus saldos corretos." action={<button className="btn-primary" onClick={() => setModal(true)}>Criar conta</button>}/>} {modal && <AccountModal close={() => setModal(false)}/>} {edit && <AccountModal item={edit} close={() => setEdit(undefined)}/>}</>
}

function Planning() {
  const { budgets, saveBudget, transactions, hideBalances } = useFinanceStore(); const { customCategories, customCategoryIcons } = useFinanceStore() as any; const month = currentMonth(); const [draft, setDraft] = useState({ category: categories[0], limit: '' }); const [showCats, setShowCats] = useState(false); const live = transactions.filter(item => !item.deletedAt); const list = budgets.filter((item: any) => item.month === month); const allCats = [...categories, ...((customCategories ?? []) as string[])]
  return <><PageTitle eyebrow="Planejamento" title="Orçamento mensal"><button className="btn-secondary" onClick={() => setShowCats(true)}><Package size={16}/> Categorias</button></PageTitle><div className="space-y-5"><Card><div className="flex items-center justify-between"><h2 className="section-title">Limites por categoria</h2><button className="text-xs font-semibold text-brand" onClick={() => setShowCats(true)}>Pack de ícones</button></div><p className="mt-1 text-sm text-muted">Acompanhe seu consumo no mês atual.</p><div className="mt-5 space-y-5">{list.length ? list.map(item => { const used = spentByCategory(live, month, item.category); const percent = Math.min(100, Math.round(used / item.limitCents * 100)); return <div key={item.id}><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{item.category}</span><span className={used > item.limitCents ? 'font-semibold text-red-600' : 'text-muted'}>{money(used, hideBalances)} de {money(item.limitCents, hideBalances)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div style={{ width: `${percent}%` }} className={`h-full rounded-full ${used > item.limitCents ? 'bg-red-500' : percent > 80 ? 'bg-amber-500' : 'bg-brand'}`}/></div><p className="mt-1 text-xs text-muted">{used > item.limitCents ? 'Limite excedido' : `${percent}% utilizado`}</p></div> }) : <p className="empty-inline">Você ainda não definiu limites.</p>}</div></Card><Card><h2 className="section-title">Novo limite</h2><p className="mt-1 text-sm text-muted">Válido para {new Date(`${month}-01T12:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p><form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); if (parseMoney(draft.limit) <= 0) return; const existing = list.find(item => item.category === draft.category); saveBudget({ id: existing?.id ?? uid(), category: draft.category, month, limitCents: parseMoney(draft.limit) }); setDraft({ category: categories[0], limit: '' }) }}><div><span className="label">Categoria</span><SelectMenu ariaLabel="Categoria do orçamento" value={draft.category} onChange={value => setDraft({ ...draft, category: value })} options={allCats.map(category => ({ value: category, label: category, icon: getCategoryIcon(category, customCategoryIcons) }))}/></div><div><span className="label">Limite mensal</span><MoneyInput ariaLabel="Limite mensal" value={draft.limit} onChange={limit => setDraft({ ...draft, limit })}/></div><button className="btn-primary w-full">Salvar limite</button></form></Card></div>{showCats && <CategoryManager close={() => setShowCats(false)} />}</>
}

function Profile() {
  const profileName = useFinanceStore(state => state.profileName)
  const setProfileName = useFinanceStore(state => state.setProfileName)
  const [name, setName] = useState(() => profileName ?? '')
  return <><PageTitle eyebrow="Perfil" title={profileName ? `Olá, ${profileName}` : 'Meu perfil'}/><div className="space-y-5">
    <Card>
      <h2 className="section-title">Seu nome</h2>
      <p className="mt-1 text-sm text-muted">Aparece na saudação do painel inicial.</p>
      <div className="mt-3 flex gap-2">
        <input className="field flex-1" value={name} onChange={event => setName(event.target.value)} placeholder="Como quer ser chamado?" aria-label="Seu nome" maxLength={40}/>
        <button className="btn-primary !px-4" onClick={()=> setProfileName(name)}>Salvar</button>
      </div>
    </Card>
    <Card><h2 className="section-title">Páginas do app</h2><div className="mt-2">
      {APP_PAGES.filter(page => page.to !== '/profile').map(page => <NavLink key={page.to} to={page.to} end={page.to === '/'} className="settings-row"><div className="flex min-w-0 items-center gap-3"><CategoryIcon icon={page.icon} size={18}/><p className="truncate font-semibold">{page.label}</p></div><ChevronRight className="text-muted shrink-0" size={20}/></NavLink>)}
    </div></Card>
    <Card>
      <NavLink to="/settings" className="settings-row"><div className="min-w-0"><p className="font-semibold">Configurações</p><p className="mt-1 text-sm text-muted">Personalize a navegação, privacidade, finanças e pagamento.</p></div><ChevronRight className="text-muted shrink-0" size={20}/></NavLink>
    </Card>
  </div></>
}

function ConfirmDelete({ close, confirm }: { close: () => void; confirm: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold">Excluir lançamento?</h2><p className="mt-2 text-sm leading-6 text-muted">Ele deixará de afetar seus saldos e relatórios. Esta ação pode ser revista no histórico técnico futuramente.</p><div className="mt-6 grid grid-cols-2 gap-3"><button className="btn-secondary" onClick={close}>Cancelar</button><button className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" onClick={confirm}>Excluir</button></div></div></div> }

interface BudgetCategory { name: string; value: number; color: string; icon: LucideIcon }
function budgetCategories(transactions: FinanceTransaction[], month: string): BudgetCategory[] { const expenses = transactions.filter(item => item.type === 'expense' && item.date.startsWith(month)); const values = (terms: RegExp) => expenses.filter(item => terms.test(item.category.toLowerCase())).reduce((sum, item) => sum + item.amountCents, 0); const housing = values(/moradia/); const food = values(/alimenta/); const transport = values(/transporte/); const leisure = values(/lazer/); const total = expenses.reduce((sum, item) => sum + item.amountCents, 0); return [{ name: 'Moradia', value: housing, color: '#2563EB', icon: House }, { name: 'Alimentação', value: food, color: '#60A5FA', icon: Utensils }, { name: 'Transporte', value: transport, color: '#F2B323', icon: Car }, { name: 'Lazer', value: leisure, color: '#9367E9', icon: Gamepad2 }, { name: 'Outros', value: Math.max(0, total - housing - food - transport - leisure), color: '#B7BCC5', icon: Package }] }
function lastNMonths(transactions: FinanceTransaction[], n: number) { return Array.from({ length: n }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (n - 1 - index)); const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; return { label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '').replace(/^./, char => char.toUpperCase()), value: sumTransactions(transactions, key, 'expense') } }) }
function lastSixMonths(transactions: FinanceTransaction[]) { return lastNMonths(transactions, 6) }
function monthKey(offset: number) { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
function sumTransactions(transactions: FinanceTransaction[], month: string, type: 'income' | 'expense') { return transactions.filter(item => item.type === type && item.date.startsWith(month)).reduce((sum, item) => sum + item.amountCents, 0) }
function percentageChange(current: number, previous: number) { if (!previous) return current ? 100 : 0; return (current - previous) / Math.abs(previous) * 100 }
function formatPercent(value: number) { return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value)}%` }
function shortMoney(value: number) { return value >= 100000 ? `R$ ${Math.round(value / 100000)}k` : value ? `R$ ${Math.round(value / 100)}` : 'R$ 0' }
function spentByCategory(transactions: FinanceTransaction[], month: string, category: string) { return transactions.filter(item => item.type === 'expense' && item.category === category && item.date.startsWith(month)).reduce((sum, item) => sum + item.amountCents, 0) }
function accountType(type: string) { return ({ checking: 'Conta corrente', savings: 'Poupança', cash: 'Dinheiro', wallet: 'Carteira digital', investment: 'Investimento' } as Record<string, string>)[type] }

export default function App() { return <Shell/> }
