import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle, BellRing, CalendarClock, CalendarRange, Car, Check, CheckCircle2, ChevronLeft,
  ChevronRight, CirclePause, Clock3, Gamepad2, GraduationCap, HeartPulse, House, Package,
  Pencil, Play, Plus, Repeat2, Search, ShoppingCart, Trash2, Tv,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Card, CategoryIcon, DatePicker, Empty, Field, Modal, MoneyInput, SelectMenu, TransactionRow } from './components'
import { categories, money, parseMoney, today, uid, type Account, type FinanceTransaction } from './domain'
import { getCategoryIcon } from './lib/categoryIcons'
import {
  calculateCommittedAmount, frequencyLabel, getNextUnrecordedOccurrence, getOccurrencesBetween,
  getUnrecordedOccurrencesBetween, recurrenceFrequencies, type RecurrenceFrequency, type RecurringExpense,
} from './recurring'
import { useFinanceStore } from './store'

const formSchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome'), amount: z.string().min(1, 'Informe o valor'),
  category: z.string().min(1, 'Selecione a categoria'), accountId: z.string().min(1, 'Selecione a conta'),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly']),
  dueDay: z.string(), startDate: z.string().min(1, 'Informe a data inicial'), endDate: z.string(),
  description: z.string(), notes: z.string(), isVariable: z.boolean(), reminderEnabled: z.boolean(), reminderDaysBefore: z.string(),
}).superRefine((values, ctx) => {
  if (parseMoney(values.amount) <= 0) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'O valor deve ser maior que zero' })
  if (!['weekly', 'biweekly'].includes(values.frequency) && (!values.dueDay || Number(values.dueDay) < 1 || Number(values.dueDay) > 31)) ctx.addIssue({ code: 'custom', path: ['dueDay'], message: 'Escolha o dia do vencimento' })
  if (values.endDate && values.endDate < values.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'A data final deve ser posterior à inicial' })
})
type FormValues = z.infer<typeof formSchema>

type ItemStatus = 'upcoming' | 'overdue' | 'paid' | 'paused'
type ExpenseFilter = 'all' | 'active' | ItemStatus

const categoryIcons: Record<string, LucideIcon> = {
  Moradia: House,
  Alimentação: ShoppingCart,
  Transporte: Car,
  Saúde: HeartPulse,
  Lazer: Gamepad2,
  Educação: GraduationCap,
  Assinaturas: Tv,
  Outros: Package,
}

const addDays = (value: string, amount: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10) }
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)).replace('.', '') : 'Sem próxima data'
const monthTitle = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)).replace(/^./, char => char.toUpperCase()) : 'Sem previsão'

function earliestOpenOccurrence(expense: RecurringExpense, transactions: ReturnType<typeof useFinanceStore.getState>['transactions']) {
  const overdue = getUnrecordedOccurrencesBetween(expense, expense.startDate, addDays(today(), -1), transactions)[0]
  return overdue ?? getNextUnrecordedOccurrence(expense, today(), transactions)
}

function expenseStatus(expense: RecurringExpense, transactions: ReturnType<typeof useFinanceStore.getState>['transactions']): ItemStatus {
  if (!expense.isActive) return 'paused'
  if (getUnrecordedOccurrencesBetween(expense, expense.startDate, addDays(today(), -1), transactions).length) return 'overdue'
  const currentMonth = today().slice(0, 7)
  if (transactions.some(transaction => !transaction.deletedAt && transaction.recurringExpenseId === expense.id && transaction.recurringOccurrenceDate?.startsWith(currentMonth))) return 'paid'
  return 'upcoming'
}

const statusMeta = {
  upcoming: { label: 'Próximo', className: 'recurring-badge upcoming', icon: Clock3 },
  overdue: { label: 'Atrasado', className: 'recurring-badge overdue', icon: AlertTriangle },
  paid: { label: 'Pago', className: 'recurring-badge paid', icon: CheckCircle2 },
  paused: { label: 'Pausado', className: 'recurring-badge paused', icon: CirclePause },
}

export function RecurringDashboardCard() {
  const { recurringExpenses, transactions, hideBalances } = useFinanceStore()
  const upcoming = recurringExpenses.filter(item => item.isActive).map(item => ({ item, date: earliestOpenOccurrence(item, transactions) })).filter(row => row.date).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 3)
  const end = addDays(today(), 30)
  const committed = calculateCommittedAmount(recurringExpenses, today(), end, transactions)
  return <Card className="dashboard-card recurring-dashboard-card">
    <div className="card-heading"><div><h2>Próximos gastos recorrentes</h2><p className="mt-1 text-xs text-muted">{money(committed, hideBalances)} comprometidos em 30 dias</p></div><NavLink to="/recurring">Ver todos</NavLink></div>
    <div className="mt-4 divide-y divide-slate-100">{upcoming.length ? upcoming.map(({ item, date }) => <NavLink to="/recurring" className="recurring-mini-row" key={item.id}><CategoryIcon icon={categoryIcons[item.category] ?? Repeat2}/><div className="min-w-0 flex-1"><strong>{item.name}</strong><span>{formatDate(date)}</span></div><b>{money(item.amountInCents, hideBalances)}</b><ChevronRight size={17}/></NavLink>) : <p className="empty-inline !py-7">Nenhum gasto recorrente ativo.</p>}</div>
  </Card>
}

export function RecurringExpensesPage() {
  const navigate = useNavigate()
  const { recurringExpenses, transactions, accounts, hideBalances } = useFinanceStore()
  const [editor, setEditor] = useState<RecurringExpense | 'new'>()
  const [selected, setSelected] = useState<RecurringExpense>()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ExpenseFilter>('all')
  const [account, setAccount] = useState('all')
  const [category, setCategory] = useState('all')
  const [frequency, setFrequency] = useState('all')
  const end7 = addDays(today(), 7); const end30 = addDays(today(), 30)
  const active = recurringExpenses.filter(item => item.isActive)
  const monthStart = `${today().slice(0, 7)}-01`
  const monthEndDate = new Date(`${monthStart}T12:00:00`); monthEndDate.setMonth(monthEndDate.getMonth() + 1); monthEndDate.setDate(0)
  const monthEnd = monthEndDate.toISOString().slice(0, 10)
  const monthlyCommitment = active.reduce((sum, item) => sum + getOccurrencesBetween(item, monthStart, monthEnd).length * item.amountInCents, 0)
  const upcoming7 = calculateCommittedAmount(recurringExpenses, today(), end7, transactions)
  const upcoming30 = calculateCommittedAmount(recurringExpenses, today(), end30, transactions)

  const filtered = useMemo(() => recurringExpenses.map(item => ({ item, date: earliestOpenOccurrence(item, transactions), status: expenseStatus(item, transactions) }))
    .filter(row => !query || `${row.item.name} ${row.item.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .filter(row => status === 'all' || (status === 'active' ? row.item.isActive : row.status === status)).filter(row => account === 'all' || row.item.accountId === account)
    .filter(row => category === 'all' || row.item.category === category).filter(row => frequency === 'all' || row.item.frequency === frequency)
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')), [recurringExpenses, transactions, query, status, account, category, frequency])
  const grouped = filtered.reduce<Record<string, typeof filtered>>((result, row) => { const key = monthTitle(row.date); (result[key] ??= []).push(row); return result }, {})

  return <>
    <div className="page-title"><div><button onClick={() => navigate('/planning')} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ChevronLeft size={17}/>Planejamento</button><h1>Gastos recorrentes</h1><span className="mt-2 block max-w-md text-xs leading-5 text-muted sm:text-sm">Acompanhe contas, assinaturas e despesas que se repetem.</span></div><button className="btn-primary" onClick={() => setEditor('new')}><Plus size={18}/><span className="hidden sm:inline">Novo gasto</span></button></div>
    <section className="recurring-summary-grid">
      <Card className="recurring-stat recurring-stat-primary"><CategoryIcon icon={Repeat2}/><div><span>Compromissos deste mês</span><strong>{money(monthlyCommitment, hideBalances)}</strong><small>{active.length} {active.length === 1 ? 'gasto recorrente ativo' : 'gastos recorrentes ativos'}</small></div></Card>
      <SummaryStat icon={CalendarClock} label="Próximos 7 dias" value={money(upcoming7, hideBalances)}/>
      <SummaryStat icon={CalendarRange} label="Próximos 30 dias" value={money(upcoming30, hideBalances)}/>
    </section>
    <Card className="mt-5"><div className="recurring-search"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar gasto recorrente…"/></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><SelectMenu ariaLabel="Filtrar por status" value={status} onChange={value => setStatus(value as ExpenseFilter)} options={[{ value: 'all', label: 'Todos os status' }, { value: 'active', label: 'Ativos' }, { value: 'upcoming', label: 'Próximos' }, { value: 'overdue', label: 'Atrasados' }, { value: 'paid', label: 'Pagos' }, { value: 'paused', label: 'Pausados' }]}/><SelectMenu ariaLabel="Filtrar por conta" value={account} onChange={setAccount} options={[{ value: 'all', label: 'Todas as contas' }, ...accounts.map(item => ({ value: item.id, label: item.name }))]}/><SelectMenu ariaLabel="Filtrar por categoria" value={category} onChange={setCategory} options={[{ value: 'all', label: 'Todas as categorias' }, ...categories.map(item => ({ value: item, label: item }))]}/><SelectMenu ariaLabel="Filtrar por frequência" value={frequency} onChange={setFrequency} options={[{ value: 'all', label: 'Todas as frequências' }, ...recurrenceFrequencies]}/></div></Card>
    <div className="mt-5 space-y-5">{Object.entries(grouped).map(([month, rows]) => <section key={month}><h2 className="recurring-month-title">{month}</h2><Card className="!p-0"><div className="divide-y divide-slate-100">{rows!.map(row => <RecurringRow key={row.item.id} expense={row.item} date={row.date} status={row.status} hidden={hideBalances} onClick={() => setSelected(row.item)}/>)}</div></Card></section>)}</div>
    {!filtered.length && <div className="mt-5"><Empty title={recurringExpenses.length ? 'Nenhum gasto encontrado' : 'Planeje o que se repete'} text={recurringExpenses.length ? 'Ajuste os filtros para ver outros resultados.' : 'Cadastre aluguel, internet, assinaturas e outras despesas fixas.'} action={<button className="btn-primary" onClick={() => setEditor('new')}><Plus size={18}/>Criar gasto recorrente</button>}/></div>}
    {editor && <RecurringExpenseModal item={editor === 'new' ? undefined : editor} close={() => setEditor(undefined)}/>} 
    {selected && <RecurringDetailModal item={selected} close={() => setSelected(undefined)} edit={() => { setEditor(selected); setSelected(undefined) }}/>} 
  </>
}

function SummaryStat({ icon, label, value }: { icon: LucideIcon; label: string; value: string }) { return <Card className="recurring-stat"><CategoryIcon icon={icon}/><div><span>{label}</span><strong>{value}</strong></div></Card> }

function RecurringRow({ expense, date, status, hidden, onClick }: { expense: RecurringExpense; date?: string; status: ItemStatus; hidden: boolean; onClick: () => void }) {
  const meta = statusMeta[status]; const StatusIcon = meta.icon; const account = useFinanceStore(state => state.accounts.find(value => value.id === expense.accountId)); const customIcons = useFinanceStore(state => (state as any).customCategoryIcons)
  return <button className="recurring-row" onClick={onClick}><CategoryIcon icon={getCategoryIcon(expense.category, customIcons)}/><div className="min-w-0 flex-1 text-left"><div className="flex items-center gap-2"><strong className="truncate">{expense.name}</strong><span className={meta.className}><StatusIcon size={12}/>{meta.label}</span></div><span>{expense.category} · {frequencyLabel(expense.frequency)} · {account?.name ?? 'Conta removida'} · {formatDate(date)}</span></div><div className="text-right"><b>{money(expense.amountInCents, hidden)}</b><small>{expense.isVariable ? 'estimativa' : 'planejado'}</small></div><ChevronRight size={18} className="text-slate-300"/></button>
}

function RecurringExpenseModal({ item, close }: { item?: RecurringExpense; close: () => void }) {
  const { accounts, saveRecurringExpense } = useFinanceStore(); const { customCategories, customCategoryIcons } = useFinanceStore() as any; const activeAccounts = (accounts as Account[]).filter((account: Account) => !account.archived); const allCats = [...categories, ...((customCategories ?? []) as string[])]
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: item ? { name: item.name, amount: String(item.amountInCents / 100), category: item.category, accountId: item.accountId, frequency: item.frequency, dueDay: String(item.dueDay ?? ''), startDate: item.startDate, endDate: item.endDate ?? '', description: item.description ?? '', notes: item.notes ?? '', isVariable: item.isVariable, reminderEnabled: item.reminderEnabled, reminderDaysBefore: String(item.reminderDaysBefore ?? 3) } : { name: '', amount: '', category: 'Moradia', accountId: activeAccounts[0]?.id ?? '', frequency: 'monthly', dueDay: '10', startDate: today(), endDate: '', description: '', notes: '', isVariable: false, reminderEnabled: true, reminderDaysBefore: '3' } })
  const frequency = form.watch('frequency'); const reminder = form.watch('reminderEnabled')
  const onSubmit = (values: FormValues) => { const timestamp = new Date().toISOString(); saveRecurringExpense({ id: item?.id ?? uid(), name: values.name.trim(), amountInCents: parseMoney(values.amount), category: values.category, accountId: values.accountId, frequency: values.frequency as RecurrenceFrequency, dueDay: ['weekly', 'biweekly'].includes(values.frequency) ? undefined : Number(values.dueDay), startDate: values.startDate, endDate: values.endDate || undefined, description: values.description.trim() || undefined, notes: values.notes.trim() || undefined, isVariable: values.isVariable, isActive: item?.isActive ?? true, reminderEnabled: values.reminderEnabled, reminderDaysBefore: values.reminderEnabled ? Number(values.reminderDaysBefore || 0) : undefined, createdAt: item?.createdAt ?? timestamp, updatedAt: timestamp }); close() }
  return <Modal title={item ? 'Editar gasto recorrente' : 'Novo gasto recorrente'} close={close}><form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
    <Field label="Nome" error={form.formState.errors.name?.message}><input className="field" placeholder="Ex.: Conta de luz" {...form.register('name')}/></Field>
    <Field label="Valor planejado" error={form.formState.errors.amount?.message}><MoneyInput ariaLabel="Valor planejado" value={form.watch('amount')} onChange={value => form.setValue('amount', value, { shouldValidate: true, shouldDirty: true })}/></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Categoria"><SelectMenu ariaLabel="Categoria" value={form.watch('category')} onChange={value => form.setValue('category', value)} options={allCats.map(value => ({ value, label: value, icon: getCategoryIcon(value, customCategoryIcons) }))}/></Field><Field label="Conta" error={form.formState.errors.accountId?.message}><SelectMenu ariaLabel="Conta de pagamento" value={form.watch('accountId')} onChange={value => form.setValue('accountId', value, { shouldValidate: true })} options={activeAccounts.map(account => ({ value: account.id, label: account.name }))}/></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Frequência"><SelectMenu ariaLabel="Frequência" value={frequency} onChange={value => form.setValue('frequency', value as RecurrenceFrequency, { shouldValidate: true })} options={recurrenceFrequencies}/></Field>{!['weekly', 'biweekly'].includes(frequency) && <Field label="Dia do vencimento" error={form.formState.errors.dueDay?.message}><SelectMenu ariaLabel="Dia do vencimento" value={form.watch('dueDay')} onChange={value => form.setValue('dueDay', value, { shouldValidate: true })} options={Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: `Dia ${index + 1}` }))}/></Field>}</div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Início"><DatePicker ariaLabel="Data inicial" value={form.watch('startDate')} onChange={value => form.setValue('startDate', value, { shouldValidate: true })}/></Field><Field label="Término (opcional)"><DatePicker ariaLabel="Data final" value={form.watch('endDate')} onChange={value => form.setValue('endDate', value, { shouldValidate: true })}/>{form.watch('endDate') && <button type="button" className="mt-1 text-xs font-semibold text-brand" onClick={() => form.setValue('endDate', '')}>Remover término</button>}</Field></div>
    <Field label="Descrição (opcional)"><input className="field" placeholder="Ex.: Contrato residencial" {...form.register('description')}/></Field><Field label="Observações (opcional)"><textarea className="field resize-none" rows={2} {...form.register('notes')}/></Field>
    <ToggleRow active={form.watch('isVariable')} onClick={() => form.setValue('isVariable', !form.watch('isVariable'))} title="Valor variável" text="Permite informar o valor real ao pagar."/>
    <ToggleRow active={reminder} onClick={() => form.setValue('reminderEnabled', !reminder)} title="Lembrete" text="Destaque o vencimento com antecedência."/>
    {reminder && <Field label="Avisar antes"><SelectMenu ariaLabel="Antecedência do lembrete" value={form.watch('reminderDaysBefore')} onChange={value => form.setValue('reminderDaysBefore', value)} options={[0, 1, 2, 3, 5, 7].map(value => ({ value: String(value), label: value ? `${value} dias antes` : 'No dia' }))}/></Field>}
    <button className="btn-primary w-full" type="submit"><Check size={18}/>Salvar gasto recorrente</button>
  </form></Modal>
}

function ToggleRow({ active, onClick, title, text }: { active: boolean; onClick: () => void; title: string; text: string }) { return <button type="button" className="settings-row !mt-0" onClick={onClick}><div><p className="font-semibold">{title}</p><p className="mt-1 text-xs text-muted">{text}</p></div><span className={`toggle ${active ? 'active' : ''}`}><span/></span></button> }

function RecurringDetailModal({ item, close, edit }: { item: RecurringExpense; close: () => void; edit: () => void }) {
  const { transactions, accounts, hideBalances, toggleRecurringExpense, deleteRecurringExpense } = useFinanceStore(); const { customCategoryIcons } = useFinanceStore() as any
  const [payment, setPayment] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false)
  const linked = transactions.filter(transaction => !transaction.deletedAt && transaction.recurringExpenseId === item.id).sort((a, b) => b.date.localeCompare(a.date))
  const occurrence = earliestOpenOccurrence(item, transactions); const status = expenseStatus(item, transactions); const meta = statusMeta[status]; const account = accounts.find(value => value.id === item.accountId)
  const realized = linked[0]?.amountCents
  if (confirmDelete) return <Modal title="Excluir gasto recorrente?" close={() => setConfirmDelete(false)}><div className="rounded-2xl bg-red-50 p-4 text-red-700"><AlertTriangle/><p className="mt-3 text-sm leading-6">Essa ação removerá os próximos lançamentos planejados desta recorrência. As transações já registradas não serão excluídas.</p></div><div className="mt-6 grid grid-cols-2 gap-3"><button className="btn-secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button><button className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white" onClick={() => { deleteRecurringExpense(item.id); close() }}>Excluir</button></div></Modal>
  return <><Modal title={item.name} close={close}><div className="recurring-detail-hero"><CategoryIcon icon={getCategoryIcon(item.category, customCategoryIcons)} size={25}/><div><span className={meta.className}>{meta.label}</span><strong>{money(item.amountInCents, hideBalances)}</strong><p>{item.category} · {frequencyLabel(item.frequency)}</p></div></div>
    <div className="recurring-detail-grid"><div><span>Próximo vencimento</span><strong>{formatDate(occurrence)}</strong></div><div><span>Conta</span><strong>{account?.name ?? 'Conta removida'}</strong></div><div><span>Planejado</span><strong>{money(item.amountInCents, hideBalances)}</strong></div><div><span>Último realizado</span><strong>{realized == null ? 'Ainda não pago' : money(realized, hideBalances)}</strong></div></div>
    {item.description && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{item.description}</p>}
    <div className="mt-5 grid grid-cols-2 gap-3"><button className="btn-secondary" onClick={edit}><Pencil size={16}/>Editar</button><button className="btn-secondary" onClick={() => { toggleRecurringExpense(item.id); close() }}>{item.isActive ? <CirclePause size={16}/> : <Play size={16}/>} {item.isActive ? 'Pausar' : 'Reativar'}</button>{item.isActive && occurrence && <button className="btn-primary col-span-2" onClick={() => setPayment(true)}><CheckCircle2 size={18}/>Marcar como pago</button>}<button className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>Excluir recorrência</button></div>
    <div className="mt-6"><h3 className="section-title">Histórico de pagamentos</h3><div className="transaction-list mt-2">{linked.length ? linked.map(transaction => <TransactionRow key={transaction.id} item={transaction}/>) : <p className="empty-inline !py-7">Nenhum pagamento registrado.</p>}</div></div>
  </Modal>{payment && occurrence && <PaymentModal item={item} occurrenceDate={occurrence} close={() => setPayment(false)} done={() => { setPayment(false); close() }}/>}</>
}

function PaymentModal({ item, occurrenceDate, close, done }: { item: RecurringExpense; occurrenceDate: string; close: () => void; done: () => void }) {
  const { accounts, markRecurringPaid } = useFinanceStore(); const activeAccounts = accounts.filter(account => !account.archived)
  const [amount, setAmount] = useState(String(item.amountInCents / 100)); const [accountId, setAccountId] = useState(item.accountId); const [paymentDate, setPaymentDate] = useState(today()); const [error, setError] = useState('')
  const submit = () => { const value = parseMoney(amount); if (value <= 0) { setError('Informe o valor pago'); return } const saved = markRecurringPaid({ recurringExpenseId: item.id, occurrenceDate, paymentDate, actualAmountInCents: value, accountId }); if (!saved) { setError('Este vencimento já foi lançado.'); return } done() }
  return <Modal title="Registrar pagamento" close={close}><div className="mb-4 rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-600">Vencimento planejado</p><p className="mt-1 font-bold">{formatDate(occurrenceDate)} · {money(item.amountInCents)}</p></div><div className="space-y-4"><Field label="Valor realizado" error={error}><MoneyInput ariaLabel="Valor realizado" value={amount} onChange={value => { setAmount(value); setError('') }}/></Field><Field label="Conta"><SelectMenu ariaLabel="Conta do pagamento" value={accountId} onChange={setAccountId} options={activeAccounts.map(account => ({ value: account.id, label: account.name }))}/></Field><Field label="Data do pagamento"><DatePicker ariaLabel="Data do pagamento" value={paymentDate} onChange={setPaymentDate}/></Field><button type="button" className="btn-primary w-full" onClick={submit}><CheckCircle2 size={18}/>Confirmar pagamento</button></div></Modal>
}
