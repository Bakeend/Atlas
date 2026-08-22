import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, CreditCard, Eye, EyeOff, Fuel, Gamepad2, GraduationCap, HeartPulse, House, Landmark, MoreHorizontal, Pencil, Receipt, ShoppingCart, Trash2, Tv, Wallet, WalletCards, X, type LucideIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { accountBalance, categories, currentMonth, money, parseMoney, today, uid, type Account, type AccountType, type FinanceTransaction, type TransactionType } from './domain'
import { useFinanceStore } from './store'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section> }

export function CategoryIcon({ icon: Icon, color = '#18B979', backgroundColor = '#E8F8F1', size = 20, className = '' }: { icon: LucideIcon; color?: string; backgroundColor?: string; size?: number; className?: string }) {
  return <span className={`category-icon ${className}`} style={{ color, backgroundColor }}><Icon size={size} strokeWidth={1.9}/></span>
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="card flex min-h-56 flex-col items-center justify-center text-center"><div className="mb-3 rounded-2xl bg-emerald-50 p-3 text-brand"><Wallet size={28} /></div><h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-sm text-sm text-muted">{text}</p>{action && <div className="mt-5">{action}</div>}</div>
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
    <div className="grid grid-cols-3 gap-2">{([['expense', 'Despesa', ArrowUpRight], ['income', 'Receita', ArrowDownLeft], ['transfer', 'Transferir', ChevronRight]] as const).map(([value, label, Icon]) => <button type="button" key={value} onClick={() => form.setValue('type', value)} className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-semibold ${type === value ? 'border-brand bg-emerald-50 text-emerald-700' : 'text-muted'}`}><Icon size={18}/>{label}</button>)}</div>
    <Field label="Valor" error={form.formState.errors.amount?.message}><input autoFocus inputMode="decimal" placeholder="0,00" className="field text-xl font-bold" {...form.register('amount')} /></Field>
    <Field label="Descrição" error={form.formState.errors.description?.message}><input placeholder={type === 'transfer' ? 'Ex.: Reserva mensal' : 'Ex.: Mercado'} className="field" {...form.register('description')} /></Field>
    {type !== 'transfer' && <Field label="Categoria"><select className="field" {...form.register('category')}>{categories.map(c => <option key={c}>{c}</option>)}</select></Field>}
    <div className="grid gap-4 sm:grid-cols-2"><Field label={type === 'transfer' ? 'Origem' : 'Conta'} error={form.formState.errors.accountId?.message}><select className="field" {...form.register('accountId')}><option value="">Selecione</option>{active.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></Field>{type === 'transfer' && <Field label="Destino" error={form.formState.errors.destinationAccountId?.message}><select className="field" {...form.register('destinationAccountId')}><option value="">Selecione</option>{active.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></Field>}</div>
    <Field label="Data"><input type="date" className="field" {...form.register('date')} /></Field><Field label="Observação (opcional)"><textarea rows={2} className="field resize-none" {...form.register('note')} /></Field>
    <button className="btn-primary w-full" type="submit"><Check size={18}/>Salvar movimentação</button>
  </form></Modal>
}

const accountSchema = z.object({ name: z.string().min(2, 'Informe o nome'), type: z.enum(['checking', 'savings', 'cash', 'wallet', 'investment']), initialBalance: z.string(), color: z.string() })
type AccountForm = z.infer<typeof accountSchema>
export function AccountModal({ close, item }: { close: () => void; item?: Account }) {
  const { addAccount, updateAccount } = useFinanceStore(); const form = useForm<AccountForm>({ resolver: zodResolver(accountSchema), defaultValues: item ? { ...item, initialBalance: String(item.initialBalanceCents / 100) } : { name: '', type: 'checking', initialBalance: '0', color: '#27C47D' } })
  return <Modal title={item ? 'Editar conta' : 'Nova conta'} close={close}><form className="space-y-4" onSubmit={form.handleSubmit(v => { const account: Account = { id: item?.id ?? uid(), name: v.name.trim(), type: v.type, initialBalanceCents: parseMoney(v.initialBalance), color: v.color, archived: item?.archived ?? false, createdAt: item?.createdAt ?? new Date().toISOString() }; item ? updateAccount(account) : addAccount(account); close() })}>
    <Field label="Nome" error={form.formState.errors.name?.message}><input autoFocus className="field" placeholder="Ex.: Conta Nubank" {...form.register('name')} /></Field><Field label="Tipo"><select className="field" {...form.register('type')}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro</option><option value="wallet">Carteira digital</option><option value="investment">Investimento</option></select></Field><div className="grid grid-cols-[1fr_auto] gap-3"><Field label="Saldo inicial"><input className="field" inputMode="decimal" {...form.register('initialBalance')} /></Field><Field label="Cor"><input type="color" className="h-11 w-14 rounded-xl border p-1" {...form.register('color')} /></Field></div><button className="btn-primary w-full"><Check size={18}/>Salvar conta</button>
  </form></Modal>
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <label><span className="label">{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label> }

export function TransactionRow({ item, onEdit, onDelete }: { item: FinanceTransaction; onEdit?: () => void; onDelete?: () => void }) {
  const { accounts, hideBalances } = useFinanceStore(); const account = accounts.find(a => a.id === item.accountId); const config = transactionVisual(item); const [open, setOpen] = useState(false)
  return <div className="transaction-row"><CategoryIcon icon={config.Icon} color={config.color} backgroundColor={config.background}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{item.description}</p><p className="mt-0.5 truncate text-xs text-muted">{formatLongDate(item.date)}{account ? ` · ${account.name}` : ''}</p></div><p className={`shrink-0 text-sm font-bold tabular-nums ${item.type === 'income' ? 'text-emerald-600' : 'text-ink'}`}>{config.sign}{money(item.amountCents, hideBalances)}</p>{onEdit && onDelete && <div className="relative"><button className="icon-button" onClick={() => setOpen(!open)} aria-label="Mais opções"><MoreHorizontal size={18}/></button>{open && <div className="absolute right-0 top-8 z-10 w-32 rounded-xl border bg-white p-1 shadow-lg"><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50" onClick={onEdit}><Pencil size={14}/>Editar</button><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50" onClick={onDelete}><Trash2 size={14}/>Excluir</button></div>}</div>}</div>
}

function transactionVisual(item: FinanceTransaction): { Icon: LucideIcon; color: string; background: string; sign: string } {
  if (item.type === 'income') return { Icon: WalletCards, color: '#18A96B', background: '#E2F7ED', sign: '+' }
  if (item.type === 'transfer') return { Icon: Wallet, color: '#2F80ED', background: '#E8F1FE', sign: '' }
  const text = `${item.category} ${item.description}`.toLowerCase()
  if (/aliment|mercado|supermerc/.test(text)) return { Icon: ShoppingCart, color: '#18A96B', background: '#E2F7ED', sign: '−' }
  if (/transporte|posto|combust|gasolina/.test(text)) return { Icon: Fuel, color: '#2F80ED', background: '#E8F1FE', sign: '−' }
  if (/moradia|aluguel|casa/.test(text)) return { Icon: House, color: '#18A96B', background: '#E2F7ED', sign: '−' }
  if (/lazer|jogo/.test(text)) return { Icon: Gamepad2, color: '#9164E8', background: '#F0EAFE', sign: '−' }
  if (/assinatura|stream|tv/.test(text)) return { Icon: Tv, color: '#9164E8', background: '#F0EAFE', sign: '−' }
  if (/saúde|saude/.test(text)) return { Icon: HeartPulse, color: '#E65D75', background: '#FCECEF', sign: '−' }
  if (/educação|educacao/.test(text)) return { Icon: GraduationCap, color: '#F1A91B', background: '#FFF5DC', sign: '−' }
  return { Icon: Receipt, color: '#6B7280', background: '#F0F1F3', sign: '−' }
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

export function AccountIcon({ type }: { type: AccountType }) { return type === 'cash' ? <Wallet size={20}/> : type === 'wallet' ? <CreditCard size={20}/> : <Landmark size={20}/> }

export function BalanceToggle() { const { hideBalances, toggleBalances } = useFinanceStore(); return <button onClick={toggleBalances} className="rounded-xl p-2 text-muted hover:bg-slate-100" aria-label={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}>{hideBalances ? <EyeOff size={20}/> : <Eye size={20}/>}</button> }
