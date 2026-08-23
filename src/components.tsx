import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Delete, Eye, EyeOff, Fuel, Gamepad2, GraduationCap, HeartPulse, House, Landmark, MoreHorizontal, Palette, Pencil, Receipt, ShoppingCart, Trash2, Tv, Wallet, WalletCards, X, type LucideIcon } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { accountBalance, categories, currentMonth, money, parseMoney, today, uid, type Account, type AccountType, type FinanceTransaction, type TransactionType } from './domain'
import { useFinanceStore } from './store'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section> }

export function CategoryIcon({ icon: Icon, color = '#2F80ED', backgroundColor = '#E8F1FE', size = 20, className = '' }: { icon: LucideIcon; color?: string; backgroundColor?: string; size?: number; className?: string }) {
  return <span className={`category-icon ${className}`} style={{ color, backgroundColor }}><Icon size={size} strokeWidth={1.9}/></span>
}

export interface SelectOption { value: string; label: string }

export function SelectMenu({ value, onChange, options, placeholder = 'Selecione', ariaLabel }: { value: string; onChange: (value: string) => void; options: SelectOption[]; placeholder?: string; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(Math.max(0, options.findIndex(option => option.value === value)))
  const selected = options.find(option => option.value === value)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  useEffect(() => { setHighlighted(Math.max(0, options.findIndex(option => option.value === value))) }, [options, value])

  const choose = (index: number) => { const option = options[index]; if (!option) return; onChange(option.value); setOpen(false) }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true)
      setHighlighted(current => event.key === 'ArrowDown' ? (current + 1) % options.length : (current - 1 + options.length) % options.length)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); open ? choose(highlighted) : setOpen(true)
    } else if (event.key === 'Escape') { setOpen(false) }
  }

  return <div className={`select-menu ${open ? 'open' : ''}`}>
    <button type="button" className="select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} onKeyDown={onKeyDown}><span className={!selected || !value ? 'placeholder' : ''}>{selected?.label ?? placeholder}</span><ChevronDown size={18} strokeWidth={2}/></button>
    {open && createPortal(<div className="control-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}><div className="control-overlay-panel select-overlay-panel" role="dialog" aria-modal="true" aria-label={ariaLabel}><div className="control-overlay-header"><div><span>{ariaLabel}</span><p>Escolha uma opção</p></div><button type="button" aria-label={`Fechar ${ariaLabel}`} onClick={() => setOpen(false)}><ChevronDown size={22}/></button></div><div className="select-overlay-list" role="listbox" aria-label={ariaLabel}>{options.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} className={`select-option ${option.value === value ? 'selected' : ''} ${index === highlighted ? 'highlighted' : ''}`} key={option.value} onMouseEnter={() => setHighlighted(index)} onClick={() => choose(index)}><span>{option.label}</span>{option.value === value && <Check size={19} strokeWidth={2.2}/>}</button>)}</div></div></div>, document.body)}
  </div>
}

export function DatePicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const initial = value ? new Date(`${value}T12:00:00`) : new Date()
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1))
  const days = calendarDays(visibleMonth)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  const select = (date: Date) => { onChange(toDateValue(date)); setOpen(false) }
  const moveMonth = (offset: number) => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  return <div className={`date-picker ${open ? 'open' : ''}`}>
    <button type="button" className="date-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(current => !current)}><span>{value ? formatShortDate(value) : 'Selecione uma data'}</span><CalendarDays size={18} strokeWidth={1.9}/></button>
    {open && createPortal(<div className="control-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}><div className="control-overlay-panel calendar-overlay-panel" role="dialog" aria-modal="true" aria-label={ariaLabel}><div className="control-overlay-header"><div><span>{ariaLabel}</span><p>Escolha uma data</p></div><button type="button" aria-label={`Fechar ${ariaLabel}`} onClick={() => setOpen(false)}><ChevronDown size={22}/></button></div><div className="calendar-header"><button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={21}/></button><strong>{formatMonthYear(visibleMonth)}</strong><button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês"><ChevronRight size={21}/></button></div><div className="calendar-weekdays">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-grid">{days.map(date => { const dateValue = toDateValue(date); const outside = date.getMonth() !== visibleMonth.getMonth(); const selected = dateValue === value; const isToday = dateValue === toDateValue(new Date()); return <button type="button" key={dateValue} className={`${outside ? 'outside' : ''} ${selected ? 'selected' : ''} ${isToday ? 'today' : ''}`} aria-label={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date)} aria-pressed={selected} onClick={() => select(date)}>{date.getDate()}</button> })}</div><button type="button" className="calendar-today" onClick={() => select(new Date())}>Hoje</button></div></div>, document.body)}
  </div>
}

const colorOptions = [
  { value: '#2F80ED', label: 'Azul' }, { value: '#2563EB', label: 'Azul intenso' },
  { value: '#4F46E5', label: 'Índigo' }, { value: '#7C3AED', label: 'Violeta' },
  { value: '#E11D48', label: 'Rosa' }, { value: '#D97706', label: 'Âmbar' },
  { value: '#475569', label: 'Grafite' }, { value: '#0F172A', label: 'Noturno' },
]

export function ColorPicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = colorOptions.find(option => option.value.toLowerCase() === value.toLowerCase()) ?? colorOptions[0]
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return <div className={`color-picker ${open ? 'open' : ''}`} ref={root}><button type="button" className="color-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(current => !current)}><span className="color-preview" style={{ backgroundColor: selected.value }}/><Palette size={18}/></button>{open && <div className="color-popover" role="dialog" aria-label={ariaLabel}><p>Escolha uma cor</p><div className="color-grid">{colorOptions.map(option => <button type="button" key={option.value} aria-label={option.label} aria-pressed={option.value === selected.value} className={option.value === selected.value ? 'selected' : ''} style={{ backgroundColor: option.value }} onClick={() => { onChange(option.value); setOpen(false) }}>{option.value === selected.value && <Check size={17}/>}</button>)}</div></div>}</div>
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first); start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date })
}
function toDateValue(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function formatShortDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function formatMonthYear(date: Date) { const value = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date); return value.charAt(0).toUpperCase() + value.slice(1) }

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="card flex min-h-56 flex-col items-center justify-center text-center"><div className="mb-3 rounded-2xl bg-blue-50 p-3 text-brand"><Wallet size={28} /></div><h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-sm text-sm text-muted">{text}</p>{action && <div className="mt-5">{action}</div>}</div>
}

export function Modal({ children, title, close }: { children: ReactNode; title: string; close: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
    <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button className="rounded-lg p-2 text-muted hover:bg-slate-100" onClick={close} aria-label="Fechar"><X size={20} /></button></div>{children}</div>
  </div>
}

const transactionSchema = z.object({ type: z.enum(['income', 'expense', 'transfer']), amount: z.string().min(1, 'Informe o valor'), description: z.string().min(2, 'Informe uma descrição'), category: z.string().min(1), accountId: z.string().min(1, 'Selecione a conta'), destinationAccountId: z.string().optional(), date: z.string().min(1), note: z.string().optional() }).superRefine((values, ctx) => { if (parseMoney(values.amount) <= 0) ctx.addIssue({ code: 'custom', message: 'O valor deve ser maior que zero', path: ['amount'] }); if (values.type === 'transfer' && !values.destinationAccountId) ctx.addIssue({ code: 'custom', message: 'Selecione o destino', path: ['destinationAccountId'] }); if (values.type === 'transfer' && values.accountId === values.destinationAccountId) ctx.addIssue({ code: 'custom', message: 'Escolha uma conta diferente', path: ['destinationAccountId'] }) })
type TransactionForm = z.infer<typeof transactionSchema>

export function TransactionModal({ close, item }: { close: () => void; item?: FinanceTransaction }) {
  const { accounts, addTransaction, updateTransaction } = useFinanceStore()
  const active = accounts.filter(a => !a.archived)
  const form = useForm<TransactionForm>({ resolver: zodResolver(transactionSchema), defaultValues: item ? { ...item, amount: String(item.amountCents / 100) } : { type: 'expense', amount: '', description: '', category: 'Alimentação', accountId: active[0]?.id ?? '', date: today(), note: '' } })
  const type = form.watch('type')
  const onSubmit = (values: TransactionForm) => {
    const transaction: FinanceTransaction = { id: item?.id ?? uid(), type: values.type, amountCents: parseMoney(values.amount), description: values.description.trim(), category: values.type === 'transfer' ? 'Transferência' : values.category, accountId: values.accountId, destinationAccountId: values.type === 'transfer' ? values.destinationAccountId : undefined, date: values.date, note: values.note?.trim() || undefined, createdAt: item?.createdAt ?? new Date().toISOString() }
    item ? updateTransaction(transaction) : addTransaction(transaction); close()
  }
  return <Modal title={item ? 'Editar movimentação' : 'Nova movimentação'} close={close}><form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
    <div className="grid grid-cols-3 gap-2">{([['expense', 'Despesa', ArrowUpRight], ['income', 'Receita', ArrowDownLeft], ['transfer', 'Transferir', ChevronRight]] as const).map(([value, label, Icon]) => <button type="button" key={value} onClick={() => form.setValue('type', value)} className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-semibold ${type === value ? 'border-brand bg-blue-50 text-blue-700' : 'text-muted'}`}><Icon size={18}/>{label}</button>)}</div>
    <Field label="Valor" error={form.formState.errors.amount?.message}><MoneyInput ariaLabel="Valor da movimentação" value={form.watch('amount')} onChange={value => form.setValue('amount', value, { shouldDirty: true, shouldValidate: true })}/></Field>
    <Field label="Descrição" error={form.formState.errors.description?.message}><input placeholder={type === 'transfer' ? 'Ex.: Reserva mensal' : 'Ex.: Mercado'} className="field" {...form.register('description')} /></Field>
    {type !== 'transfer' && <Field label="Categoria"><SelectMenu ariaLabel="Categoria" value={form.watch('category')} onChange={value => form.setValue('category', value, { shouldDirty: true, shouldValidate: true })} options={categories.map(category => ({ value: category, label: category }))}/></Field>}
    <div className="grid gap-4 sm:grid-cols-2"><Field label={type === 'transfer' ? 'Origem' : 'Conta'} error={form.formState.errors.accountId?.message}><SelectMenu ariaLabel={type === 'transfer' ? 'Conta de origem' : 'Conta'} value={form.watch('accountId')} onChange={value => form.setValue('accountId', value, { shouldDirty: true, shouldValidate: true })} options={[{ value: '', label: 'Selecione' }, ...active.map(account => ({ value: account.id, label: account.name }))]}/></Field>{type === 'transfer' && <Field label="Destino" error={form.formState.errors.destinationAccountId?.message}><SelectMenu ariaLabel="Conta de destino" value={form.watch('destinationAccountId') ?? ''} onChange={value => form.setValue('destinationAccountId', value, { shouldDirty: true, shouldValidate: true })} options={[{ value: '', label: 'Selecione' }, ...active.map(account => ({ value: account.id, label: account.name }))]}/></Field>}</div>
    <Field label="Data"><DatePicker ariaLabel="Data da movimentação" value={form.watch('date')} onChange={value => form.setValue('date', value, { shouldDirty: true, shouldValidate: true })}/></Field><Field label="Observação (opcional)"><textarea rows={2} className="field resize-none" {...form.register('note')} /></Field>
    <button className="btn-primary w-full" type="submit"><Check size={18}/>Salvar movimentação</button>
  </form></Modal>
}

const accountSchema = z.object({ name: z.string().min(2, 'Informe o nome'), type: z.enum(['checking', 'savings', 'cash', 'wallet', 'investment']), initialBalance: z.string(), color: z.string() })
type AccountForm = z.infer<typeof accountSchema>
export function AccountModal({ close, item }: { close: () => void; item?: Account }) {
  const { addAccount, updateAccount } = useFinanceStore(); const form = useForm<AccountForm>({ resolver: zodResolver(accountSchema), defaultValues: item ? { ...item, initialBalance: String(item.initialBalanceCents / 100) } : { name: '', type: 'checking', initialBalance: '0', color: '#2F80ED' } })
  return <Modal title={item ? 'Editar conta' : 'Nova conta'} close={close}><form className="space-y-4" onSubmit={form.handleSubmit(v => { const account: Account = { id: item?.id ?? uid(), name: v.name.trim(), type: v.type, initialBalanceCents: parseMoney(v.initialBalance), color: v.color, archived: item?.archived ?? false, createdAt: item?.createdAt ?? new Date().toISOString() }; item ? updateAccount(account) : addAccount(account); close() })}>
    <Field label="Nome" error={form.formState.errors.name?.message}><input autoFocus className="field" placeholder="Ex.: Conta Nubank" {...form.register('name')} /></Field><Field label="Tipo"><SelectMenu ariaLabel="Tipo de conta" value={form.watch('type')} onChange={value => form.setValue('type', value as AccountForm['type'], { shouldDirty: true, shouldValidate: true })} options={[{ value: 'checking', label: 'Conta corrente' }, { value: 'savings', label: 'Poupança' }, { value: 'cash', label: 'Dinheiro' }, { value: 'wallet', label: 'Carteira digital' }, { value: 'investment', label: 'Investimento' }]}/></Field><div className="grid grid-cols-[1fr_auto] gap-3"><Field label="Saldo inicial"><MoneyInput ariaLabel="Saldo inicial" value={form.watch('initialBalance')} onChange={value => form.setValue('initialBalance', value, { shouldDirty: true })}/></Field><Field label="Cor"><ColorPicker ariaLabel="Cor da conta" value={form.watch('color')} onChange={value => form.setValue('color', value, { shouldDirty: true, shouldValidate: true })}/></Field></div><button className="btn-primary w-full"><Check size={18}/>Salvar conta</button>
  </form></Modal>
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <div><span className="label">{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</div> }

function centsToDigits(value: string): string {
  const parsed = Number.parseFloat(value.replace(',', '.'))
  const cents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
  return cents > 0 ? String(cents) : ''
}

export function MoneyInput({ value, onChange, ariaLabel, autoFocus = false }: { value: string; onChange: (value: string) => void; ariaLabel: string; autoFocus?: boolean }) {
  const [digits, setDigits] = useState(() => centsToDigits(value))
  const [open, setOpen] = useState(autoFocus)
  const [animationKey, setAnimationKey] = useState(0)
  const [freshDigits, setFreshDigits] = useState(0)
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  const cents = digits ? Number.parseInt(digits, 10) : 0
  const display = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  const empty = digits === ''
  useEffect(() => { if (value !== lastEmitted.current) { lastEmitted.current = value; setDigits(centsToDigits(value)) } }, [value])

  const apply = (next: string) => {
    const clean = next.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 11)
    const emitted = (Number.parseInt(clean || '0', 10) / 100).toFixed(2).replace('.', ',')
    lastEmitted.current = emitted
    setDigits(clean)
    setAnimationKey(current => current + 1)
    onChange(emitted)
  }
  const press = (key: string) => {
    setFreshDigits(key === 'back' ? 0 : key.length)
    apply(key === 'back' ? digits.slice(0, -1) : digits + key)
  }

  return <div className={`money-input ${open ? 'open' : ''}`}>
    <button type="button" className={`money-trigger ${empty ? 'placeholder' : ''}`} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <MoneyDisplay display={display}/>
      <ChevronDown size={18}/>
    </button>
    {open && createPortal(<div className="money-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}><div className="money-overlay-panel" role="dialog" aria-modal="true" aria-label={`${ariaLabel} — teclado numérico`}><div className="money-overlay-header"><div><span>{ariaLabel}</span><p>Digite o valor</p></div><button type="button" aria-label="Fechar teclado numérico" onClick={() => setOpen(false)}><ChevronDown size={22}/></button></div><div className={`money-overlay-value ${empty ? 'placeholder' : ''}`}><MoneyDisplay display={display} animationKey={animationKey} freshDigits={freshDigits}/></div><div className="money-keypad"><div className="money-keypad-grid">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map(key => <button type="button" key={key} className="money-key" aria-label={key === '00' ? 'Dois zeros' : `Número ${key}`} onClick={() => press(key)}>{key}</button>)}<button type="button" className="money-key money-delete" aria-label="Apagar último dígito" onClick={() => press('back')}><Delete size={22}/></button></div></div></div></div>, document.body)}
  </div>
}

function MoneyDisplay({ display, animationKey = 0, freshDigits = 0 }: { display: string; animationKey?: number; freshDigits?: number }) {
  const freshStart = display.length - freshDigits
  return <span className="money-display" aria-live="polite">{[...display].map((char, index) => <span key={`${animationKey}-${index}-${char}`} className={`money-char${animationKey > 0 && index >= freshStart && /\d/.test(char) ? ' pop' : ''}`}>{char === ' ' ? '\u00A0' : char}</span>)}</span>
}

export function TransactionRow({ item, onEdit, onDelete }: { item: FinanceTransaction; onEdit?: () => void; onDelete?: () => void }) {
  const { accounts, hideBalances } = useFinanceStore(); const account = accounts.find(a => a.id === item.accountId); const config = transactionVisual(item); const [open, setOpen] = useState(false)
  return <div className="transaction-row"><CategoryIcon icon={config.Icon} color={config.color} backgroundColor={config.background}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{item.description}</p><p className="mt-0.5 truncate text-xs text-muted">{formatLongDate(item.date)}{account ? ` · ${account.name}` : ''}</p></div><div className={`transaction-amount ${config.amountTone}`}><config.AmountIcon size={15} strokeWidth={2.4}/><span>{money(item.amountCents, hideBalances)}</span></div>{onEdit && onDelete && <div className="relative"><button className="icon-button" onClick={() => setOpen(!open)} aria-label="Mais opções"><MoreHorizontal size={18}/></button>{open && <div className="absolute right-0 top-8 z-10 w-32 rounded-xl border bg-white p-1 shadow-lg"><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50" onClick={onEdit}><Pencil size={14}/>Editar</button><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50" onClick={onDelete}><Trash2 size={14}/>Excluir</button></div>}</div>}</div>
}

function transactionVisual(item: FinanceTransaction): { Icon: LucideIcon; AmountIcon: LucideIcon; amountTone: string; color: string; background: string } {
  if (item.type === 'income') return { Icon: WalletCards, AmountIcon: ArrowDownLeft, amountTone: 'income', color: '#16A36A', background: '#E5F8EF' }
  if (item.type === 'transfer') return { Icon: Wallet, AmountIcon: ArrowLeftRight, amountTone: 'transfer', color: '#2F80ED', background: '#E8F1FE' }
  const text = `${item.category} ${item.description}`.toLowerCase()
  if (/aliment|mercado|supermerc/.test(text)) return { Icon: ShoppingCart, AmountIcon: ArrowUpRight, amountTone: 'expense', color: '#2563EB', background: '#DBEAFE' }
  if (/transporte|posto|combust|gasolina/.test(text)) return { Icon: Fuel, AmountIcon: ArrowUpRight, amountTone: 'expense', color: '#2F80ED', background: '#E8F1FE' }
  if (/moradia|aluguel|casa/.test(text)) return { Icon: House, AmountIcon: ArrowUpRight, amountTone: 'expense', color: '#1D4ED8', background: '#E8F1FE' }
  if (/lazer|jogo/.test(text)) return { Icon: Gamepad2, AmountIcon: ArrowUpRight, amountTone: 'expense', color: '#9164E8', background: '#F0EAFE' }
  if (/assinatura|stream|tv/.test(text)) return { Icon: Tv, AmountIcon: ArrowUpRight, amountTone: 'expense', color: '#9164E8', background: '#F0EAFE' }
  if (/saúde|saude/.test(text)) return { Icon: HeartPulse, AmountIcon: ArrowUpRight, amountTone: 'expense', color: '#E65D75', background: '#FCECEF' }
  if (/educação|educacao/.test(text)) return { Icon: GraduationCap, AmountIcon: ArrowUpRight, amountTone: 'expense', color: '#F1A91B', background: '#FFF5DC' }
  return { Icon: Receipt, AmountIcon: ArrowUpRight, amountTone: 'expense', color: '#6B7280', background: '#F0F1F3' }
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

export function AccountIcon({ type }: { type: AccountType }) { return type === 'cash' ? <Wallet size={20}/> : type === 'wallet' ? <CreditCard size={20}/> : <Landmark size={20}/> }

export function BalanceToggle() { const { hideBalances, toggleBalances } = useFinanceStore(); return <button onClick={toggleBalances} className="rounded-xl p-2 text-muted hover:bg-slate-100" aria-label={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}>{hideBalances ? <EyeOff size={20}/> : <Eye size={20}/>}</button> }
