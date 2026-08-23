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

export type PaymentAllocationItemType = 'bill' | 'budget' | 'goal' | 'reserve' | 'safety' | 'free'

export interface PaymentAllocationItem {
  id: string
  label: string
  type: PaymentAllocationItemType
  amountInCents: number
  categoryId?: string
  goalId?: string
  recurringExpenseId?: string
  isConsumed?: boolean
}

export interface PaymentAllocationPlan {
  id: string
  sourceTransactionId?: string
  receivedAmountInCents: number
  periodStart: string
  periodEnd: string
  items: PaymentAllocationItem[]
  freeAmountInCents: number
  status: 'draft' | 'applied' | 'cancelled'
  createdAt: string
  updatedAt: string
}

export type AllocationPriority =
  | 'overdue'
  | 'essential'
  | 'bills'
  | 'food'
  | 'transport'
  | 'goals'
  | 'reserve'
  | 'leisure'
  | 'free'

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

export interface PaymentAllocationPreference {
  id: string
  rule: string
  // ex: "Todo salário guarda 10%" -> { type: 'percent', percent: 10, target: 'reserve' }
  // "Sempre separa R$600 para alimentação" -> { type: 'fixed', category: 'Alimentação', amountInCents: 60000 }
  // "Minha prioridade é quitar cartão antes de lazer" -> priority override
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
  paymentAllocationPlans: PaymentAllocationPlan[]
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
  paymentAllocationPriority?: AllocationPriority[]
  paymentAllocationPreferences?: PaymentAllocationPreference[]
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

export function emptyData(): FinanceData {
  return {
    accounts: [],
    transactions: [],
    budgets: [],
    recurringExpenses: [],
    recurringIncomes: [],
    goals: [],
    allocationPlans: [],
    paymentAllocationPlans: [],
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
    paymentAllocationPriority: ['overdue','essential','bills','food','transport','goals','reserve','leisure','free'] as AllocationPriority[],
    paymentAllocationPreferences: [],
  }
}
