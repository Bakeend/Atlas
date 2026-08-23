export type TransactionType = 'income' | 'expense' | 'transfer'
export type AccountType = 'checking' | 'savings' | 'cash' | 'wallet' | 'investment'
export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly'

export interface RecurringExpense {
  id: string
  name: string
  amountInCents: number
  category: string
  accountId: string
  frequency: RecurrenceFrequency
  dueDay?: number
  startDate: string
  endDate?: string
  description?: string
  notes?: string
  isVariable: boolean
  isActive: boolean
  reminderEnabled: boolean
  reminderDaysBefore?: number
  createdAt: string
  updatedAt: string
}

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
  recurringExpenseId?: string
  recurringOccurrenceDate?: string
  plannedAmountCents?: number
  createdAt: string
  deletedAt?: string
}

export interface Budget { id: string; category: string; month: string; limitCents: number }

export interface Goal {
  id: string
  title: string
  targetAmountInCents: number
  currentAmountInCents: number
  category?: string
  accountId?: string
  deadline?: string
  createdAt: string
  updatedAt: string
}

export interface RecurringIncome {
  id: string
  name: string
  amountInCents: number
  category: string
  accountId: string
  frequency: RecurrenceFrequency
  dueDay?: number
  startDate: string
  endDate?: string
  description?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AllocationItem {
  id: string
  type: 'bill' | 'budget' | 'goal' | 'reserve' | 'free'
  label: string
  amountInCents: number
  categoryId?: string
  recurringExpenseId?: string
  goalId?: string
}

export interface AllocationPlan {
  id: string
  periodStart: string
  periodEnd: string
  availableAmountInCents: number
  allocations: AllocationItem[]
  createdAt: string
  status: 'draft' | 'applied'
  note?: string
}

export interface AiConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface AiMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  toolResults?: Array<{ toolCallId: string; name: string; result: unknown }>
  createdAt: string
}

export interface AiActionLog {
  id: string
  timestamp: string
  conversationId: string
  action: string
  entityType: string
  entityId: string
  status: 'success' | 'failed' | 'pending_confirmation'
  requiresConfirmation: boolean
  detail?: string
}

export interface AiRule {
  id: string
  type: 'category_mapping'
  pattern: string
  targetId: string
  enabled: boolean
  createdAt: string
}

export interface FinanceData {
  accounts: Account[]
  transactions: FinanceTransaction[]
  budgets: Budget[]
  recurringExpenses: RecurringExpense[]
  recurringIncomes: RecurringIncome[]
  goals: Goal[]
  allocationPlans: AllocationPlan[]
  customCategories: string[]
  customCategoryIcons: Record<string, string>
  aiConversations: AiConversation[]
  aiMessages: AiMessage[]
  aiLogs: AiActionLog[]
  aiRules: AiRule[]
  hideBalances: boolean
  readNotificationIds: string[]
  forecastRealistic: boolean
  safetyMarginPercent: number
}

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
  const bank = { id: 'account-bank', name: 'Conta principal', type: 'checking' as const, initialBalanceCents: 450000, color: '#2F80ED', archived: false, createdAt: today() }
  const cash = { id: 'account-cash', name: 'Carteira', type: 'cash' as const, initialBalanceCents: 8000, color: '#2F80ED', archived: false, createdAt: today() }
  const month = currentMonth()
  const createdAt = today()
  const recurringExpenses: RecurringExpense[] = [
    { id: 'recurring-rent', name: 'Aluguel', amountInCents: 142500, category: 'Moradia', accountId: bank.id, frequency: 'monthly', dueDay: 6, startDate: `${month}-01`, description: 'Apartamento', isVariable: false, isActive: true, reminderEnabled: true, reminderDaysBefore: 3, createdAt, updatedAt: createdAt },
    { id: 'recurring-internet', name: 'Internet', amountInCents: 11990, category: 'Assinaturas', accountId: bank.id, frequency: 'monthly', dueDay: 12, startDate: `${month}-01`, isVariable: false, isActive: true, reminderEnabled: true, reminderDaysBefore: 2, createdAt, updatedAt: createdAt },
    { id: 'recurring-streaming', name: 'Streaming', amountInCents: 2990, category: 'Assinaturas', accountId: bank.id, frequency: 'monthly', dueDay: 18, startDate: `${month}-01`, isVariable: false, isActive: true, reminderEnabled: false, createdAt, updatedAt: createdAt },
  ]
  return {
    accounts: [bank, cash],
    transactions: [
      { id: 'seed-1', type: 'income', amountCents: 620000, description: 'Salário', category: 'Receita', accountId: bank.id, date: `${month}-05`, createdAt: today() },
      { id: 'seed-2', type: 'expense', amountCents: 142500, description: 'Aluguel', category: 'Moradia', accountId: bank.id, date: `${month}-06`, createdAt: today() },
      { id: 'seed-3', type: 'expense', amountCents: 7860, description: 'Mercado', category: 'Alimentação', accountId: bank.id, date: `${month}-12`, createdAt: today() },
      { id: 'seed-4', type: 'expense', amountCents: 2990, description: 'Streaming', category: 'Assinaturas', accountId: bank.id, date: `${month}-18`, createdAt: today() },
    ],
    budgets: [{ id: 'budget-food', category: 'Alimentação', month, limitCents: 80000 }, { id: 'budget-leisure', category: 'Lazer', month, limitCents: 40000 }],
    recurringExpenses,
    recurringIncomes: [],
    goals: [],
    allocationPlans: [],
    customCategories: [],
    customCategoryIcons: {},
    aiConversations: [],
    aiMessages: [],
    aiLogs: [],
    aiRules: [],
    hideBalances: false,
    readNotificationIds: [],
    forecastRealistic: true,
    safetyMarginPercent: 10,
  }
}
