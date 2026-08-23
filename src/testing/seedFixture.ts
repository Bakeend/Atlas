import { currentMonth, today, type AllocationPriority, type FinanceData, type RecurringExpense } from '../domain'

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
