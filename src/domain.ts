export type TransactionType = 'income' | 'expense' | 'transfer'
export type AccountType = 'checking' | 'savings' | 'cash' | 'wallet' | 'investment'

export interface Account {
  id: string
  name: string
  type: AccountType
  initialBalanceCents: number
  color: string
  archived: boolean
  createdAt: string
}

export interface FinanceTransaction {
  id: string
  type: TransactionType
  amountCents: number
  description: string
  category: string
  accountId: string
  destinationAccountId?: string
  date: string
  note?: string
  createdAt: string
  deletedAt?: string
}

export interface Budget { id: string; category: string; month: string; limitCents: number }
export interface FinanceData { accounts: Account[]; transactions: FinanceTransaction[]; budgets: Budget[]; hideBalances: boolean }

export const categories = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Assinaturas', 'Outros']
export const uid = () => crypto.randomUUID()
export const today = () => new Date().toISOString().slice(0, 10)
export const currentMonth = () => today().slice(0, 7)
export const money = (cents: number, hidden = false) => hidden ? '••••••' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)

export function parseMoney(value: string): number {
  const normalized = value.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

export function accountBalance(account: Account, transactions: FinanceTransaction[]) {
  return account.initialBalanceCents + transactions.filter(t => !t.deletedAt).reduce((total, t) => {
    if (t.type === 'income' && t.accountId === account.id) return total + t.amountCents
    if (t.type === 'expense' && t.accountId === account.id) return total - t.amountCents
    if (t.type === 'transfer' && t.accountId === account.id) return total - t.amountCents
    if (t.type === 'transfer' && t.destinationAccountId === account.id) return total + t.amountCents
    return total
  }, 0)
}

export function seededData(): FinanceData {
  const bank = { id: 'account-bank', name: 'Conta principal', type: 'checking' as const, initialBalanceCents: 450000, color: '#27C47D', archived: false, createdAt: today() }
  const cash = { id: 'account-cash', name: 'Carteira', type: 'cash' as const, initialBalanceCents: 8000, color: '#2F80ED', archived: false, createdAt: today() }
  const month = currentMonth()
  return {
    accounts: [bank, cash],
    transactions: [
      { id: 'seed-1', type: 'income', amountCents: 620000, description: 'Salário', category: 'Receita', accountId: bank.id, date: `${month}-05`, createdAt: today() },
      { id: 'seed-2', type: 'expense', amountCents: 142500, description: 'Aluguel', category: 'Moradia', accountId: bank.id, date: `${month}-06`, createdAt: today() },
      { id: 'seed-3', type: 'expense', amountCents: 7860, description: 'Mercado', category: 'Alimentação', accountId: bank.id, date: `${month}-12`, createdAt: today() },
      { id: 'seed-4', type: 'expense', amountCents: 2990, description: 'Streaming', category: 'Assinaturas', accountId: bank.id, date: `${month}-18`, createdAt: today() },
    ],
    budgets: [{ id: 'budget-food', category: 'Alimentação', month, limitCents: 80000 }, { id: 'budget-leisure', category: 'Lazer', month, limitCents: 40000 }],
    hideBalances: false,
  }
}
