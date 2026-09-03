import { z } from 'zod'
import { accountBalance, categories as defaultCategories, money, today } from '../../domain'
import { useFinanceStore } from '../../store'
import { calculateCommittedAmount, getUnrecordedOccurrencesBetween } from '../../recurring'
import { calculateBudgetUsage, calculateMonthlyExpenseView, calculateMonthlyIncomeView } from '../../financialView'
import { analyzeSpending, calculateAvailableMoney, calculateNextIncome, detectAnomalies, getCashFlow } from '../services/financialEngine'
import {
  getAccountsSchema, getAccountBalancesSchema, getAvailableMoneySchema, getBudgetsSchema, getBudgetStatusSchema, getCashFlowForecastSchema,
  getCategoriesSchema, getFinancialSummarySchema, getGoalsSchema, getNextIncomeSchema, getRecurringExpensesSchema,
  getRecurringIncomeSchema, getSpendingAnalysisSchema, getSpendingAnomaliesSchema, getTransactionsByCategorySchema,
  getTransactionsByPeriodSchema, getTransactionsSchema, getUpcomingCommitmentsSchema
} from '../schemas/toolSchemas'

export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
  _zod?: z.ZodTypeAny
  _execute: (args: any) => Promise<unknown> | unknown
}

function addDaysIso(d: string, days: number): string {
  const date = new Date(`${d}T12:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const readTools: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'getFinancialSummary',
      description: 'Resumo financeiro geral com valores realizados, comprometidos e projetados do mês, saldo atual e compromissos futuros.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    _zod: getFinancialSummarySchema,
    _execute: async () => {
      const s = useFinanceStore.getState() as any
      const live = s.transactions.filter((t:any)=>!t.deletedAt)
      const month = today().slice(0,7)
      const total = s.accounts.filter((a:any)=>!a.archived).reduce((sum:number,a:any)=>sum+accountBalance(a, live),0)
      const income = calculateMonthlyIncomeView(s.transactions, s.recurringIncomes ?? [], month)
      const expense = calculateMonthlyExpenseView(s.transactions, s.recurringExpenses, month)
      const committed7 = calculateCommittedAmount(s.recurringExpenses, today(), addDaysIso(today(),7), s.transactions)
      const committed30 = calculateCommittedAmount(s.recurringExpenses, today(), addDaysIso(today(),30), s.transactions)
      return {
        totalBalanceCents: total, totalBalance: money(total),
        monthIncomeCents: income.realizedCents, monthIncome: money(income.realizedCents),
        monthIncomeRealizedCents: income.realizedCents, monthIncomeRealized: money(income.realizedCents),
        monthIncomeCommittedCents: income.committedCents, monthIncomeCommitted: money(income.committedCents),
        monthIncomeProjectedCents: income.projectedCents, monthIncomeProjected: money(income.projectedCents),
        monthExpenseCents: expense.realizedCents, monthExpense: money(expense.realizedCents),
        monthExpenseRealizedCents: expense.realizedCents, monthExpenseRealized: money(expense.realizedCents),
        monthExpenseCommittedCents: expense.committedCents, monthExpenseCommitted: money(expense.committedCents),
        monthExpenseProjectedCents: expense.projectedCents, monthExpenseProjected: money(expense.projectedCents),
        committedNext7DaysCents: committed7, committedNext7Days: money(committed7),
        committedNext30DaysCents: committed30, committedNext30Days: money(committed30),
        accountsCount: s.accounts.length, transactionsCount: live.length,
        budgetsCount: s.budgets.filter((b:any)=>b.month===month).length,
        recurringActive: s.recurringExpenses.filter((r:any)=>r.isActive).length,
        goalsCount: (s.goals??[]).length,
      }
    }
  },
  {
    type: 'function',
    function: { name: 'getAccounts', description: 'Lista contas/carteiras com tipo e status.', parameters: { type: 'object', properties: {}, required: [] } },
    _zod: getAccountsSchema,
    _execute: async () => {
      const s = useFinanceStore.getState() as any
      return s.accounts.map((a:any)=> ({ id: a.id, name: a.name, type: a.type, archived: a.archived, color: a.color }))
    }
  },
  {
    type: 'function',
    function: { name: 'getAccountBalances', description: 'Saldos atuais por conta. Considera apenas saldo inicial e movimentações realizadas; compromissos futuros não alteram saldo atual.', parameters: { type: 'object', properties: {}, required: [] } },
    _zod: getAccountBalancesSchema,
    _execute: async () => {
      const s = useFinanceStore.getState() as any
      const live = s.transactions.filter((t:any)=>!t.deletedAt)
      return s.accounts.map((a:any)=> ({ id: a.id, name: a.name, balanceCents: accountBalance(a, live), balance: money(accountBalance(a, live)), archived: a.archived }))
    }
  },
  {
    type: 'function',
    function: {
      name: 'getTransactions', description: 'Lista transações realizadas com filtros opcionais.',
      parameters: { type: 'object', properties: { limit: { type: 'number' }, offset: { type: 'number' }, type: { type: 'string', enum: ['income','expense','transfer','all'] }, category: { type: 'string' }, accountId: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' }, query: { type: 'string' } }, required: [] },
    },
    _zod: getTransactionsSchema,
    _execute: async (args:any) => {
      const s = useFinanceStore.getState() as any
      let list = s.transactions.filter((t:any)=>!t.deletedAt)
      if (args.type && args.type!=='all') list = list.filter((t:any)=>t.type===args.type)
      if (args.category) list = list.filter((t:any)=>t.category===args.category)
      if (args.accountId) list = list.filter((t:any)=>t.accountId===args.accountId || t.destinationAccountId===args.accountId)
      if (args.startDate) list = list.filter((t:any)=>t.date>=args.startDate)
      if (args.endDate) list = list.filter((t:any)=>t.date<=args.endDate)
      if (args.query) list = list.filter((t:any)=> t.description.toLowerCase().includes(String(args.query).toLowerCase()) || t.category.toLowerCase().includes(String(args.query).toLowerCase()))
      list = list.sort((a:any,b:any)=> b.date.localeCompare(a.date))
      const total = list.length
      const slice = list.slice(args.offset ?? 0, (args.offset ?? 0)+(args.limit ?? 20))
      return { total, count: slice.length, transactions: slice.map((t:any)=>({ id:t.id, type:t.type, description:t.description, category:t.category, amountCents:t.amountCents, amount:money(t.amountCents), date:t.date, accountId:t.accountId, destinationAccountId:t.destinationAccountId })) }
    }
  },
  {
    type: 'function',
    function: { name: 'getTransactionsByPeriod', description: 'Transações realizadas em um intervalo de datas.', parameters: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, type: { type: 'string', enum: ['income','expense','transfer','all'], default: 'all' } }, required: ['startDate','endDate'] } },
    _zod: getTransactionsByPeriodSchema,
    _execute: async (args:any) => {
      const s = useFinanceStore.getState() as any
      let list = s.transactions.filter((t:any)=>!t.deletedAt && t.date>=args.startDate && t.date<=args.endDate)
      if (args.type && args.type!=='all') list = list.filter((t:any)=>t.type===args.type)
      const income = list.filter((t:any)=>t.type==='income').reduce((sum:number,t:any)=>sum+t.amountCents,0)
      const expense = list.filter((t:any)=>t.type==='expense').reduce((sum:number,t:any)=>sum+t.amountCents,0)
      return { period: { start: args.startDate, end: args.endDate }, count: list.length, incomeCents: income, expenseCents: expense, income: money(income), expense: money(expense), transactions: list.slice(0,50).map((t:any)=>({ id:t.id, type:t.type, description:t.description, category:t.category, amount:money(t.amountCents), date:t.date })) }
    }
  },
  {
    type: 'function',
    function: { name: 'getTransactionsByCategory', description: 'Transações realizadas filtradas por categoria, opcionalmente por período.', parameters: { type: 'object', properties: { category: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' }, limit: { type: 'number' } }, required: ['category'] } },
    _zod: getTransactionsByCategorySchema,
    _execute: async (args:any) => {
      const s = useFinanceStore.getState() as any
      let list = s.transactions.filter((t:any)=>!t.deletedAt && t.category===args.category)
      if (args.startDate) list = list.filter((t:any)=>t.date>=args.startDate)
      if (args.endDate) list = list.filter((t:any)=>t.date<=args.endDate)
      list = list.sort((a:any,b:any)=> b.date.localeCompare(a.date))
      const total = list.filter((t:any)=>t.type==='expense').reduce((sum:number,t:any)=>sum+t.amountCents,0)
      return { category: args.category, count: list.length, realizedExpenseCents: total, realizedExpense: money(total), transactions: list.slice(0, args.limit??20).map((t:any)=>({ id:t.id, description:t.description, amount:money(t.amountCents), date:t.date, type:t.type })) }
    }
  },
  {
    type: 'function',
    function: { name: 'getCategories', description: 'Lista categorias disponíveis.', parameters: { type: 'object', properties: {}, required: [] } },
    _zod: getCategoriesSchema,
    _execute: async () => {
      const s = useFinanceStore.getState() as any
      const all = new Set<string>([...defaultCategories, ...(s.customCategories ?? [])])
      for (const t of s.transactions) if (!t.deletedAt) all.add(t.category)
      return { categories: Array.from(all) }
    }
  },
  {
    type: 'function',
    function: { name: 'getRecurringExpenses', description: 'Lista gastos recorrentes e sua próxima ocorrência ainda não realizada.', parameters: { type: 'object', properties: { activeOnly: { type: 'boolean' } }, required: [] } },
    _zod: getRecurringExpensesSchema,
    _execute: async (args:any) => {
      const s = useFinanceStore.getState() as any
      let list = s.recurringExpenses as any[]
      if (args.activeOnly) list = list.filter((r:any)=>r.isActive)
      return list.map((r:any)=>({ id:r.id, name:r.name, amountCents:r.amountInCents, amount:money(r.amountInCents), category:r.category, frequency:r.frequency, dueDay:r.dueDay, isActive:r.isActive, accountId:r.accountId, nextOccurrence: (()=>{ try{ return getUnrecordedOccurrencesBetween(r, today(), addDaysIso(today(),60), s.transactions)[0] ?? null } catch { return null } })() }))
    }
  },
  {
    type: 'function',
    function: { name: 'getRecurringIncome', description: 'Lista receitas recorrentes como salário. Use getNextIncome para a próxima ocorrência ainda não recebida.', parameters: { type: 'object', properties: { activeOnly: { type: 'boolean' } }, required: [] } },
    _zod: getRecurringIncomeSchema,
    _execute: async (args:any) => {
      const s = useFinanceStore.getState() as any
      let list = (s.recurringIncomes ?? []) as any[]
      if (args.activeOnly) list = list.filter((r:any)=>r.isActive)
      return list.map((r:any)=>({ id:r.id, name:r.name, amountCents:r.amountInCents, amount:money(r.amountInCents), category:r.category, frequency:r.frequency, dueDay:r.dueDay, isActive:r.isActive, accountId:r.accountId }))
    }
  },
  {
    type: 'function',
    function: { name: 'getUpcomingCommitments', description: 'Despesas recorrentes futuras ainda não realizadas nos próximos N dias.', parameters: { type: 'object', properties: { days: { type: 'number' } }, required: [] } },
    _zod: getUpcomingCommitmentsSchema,
    _execute: async (args:any) => {
      const days = args.days ?? 30
      const s = useFinanceStore.getState() as any
      const start = today(), end = addDaysIso(start, days)
      const total = calculateCommittedAmount(s.recurringExpenses, start, end, s.transactions)
      const byExpense = s.recurringExpenses.filter((r:any)=>r.isActive).map((r:any)=>{
        const occ = getUnrecordedOccurrencesBetween(r, start, end, s.transactions)
        return { id:r.id, name:r.name, amount:money(r.amountInCents), occurrences: occ.length, total: money(occ.length*r.amountInCents), next: occ[0]??null }
      }).filter((x:any)=>x.occurrences>0)
      return { period: { start, end, days }, totalCents: total, total: money(total), breakdown: byExpense }
    }
  },
  {
    type: 'function',
    function: { name: 'getBudgets', description: 'Orçamentos com realizado, comprometido, projetado e restante.', parameters: { type: 'object', properties: { month: { type: 'string' } }, required: [] } },
    _zod: getBudgetsSchema,
    _execute: async (args:any) => {
      const s = useFinanceStore.getState() as any
      const month = args.month ?? today().slice(0,7)
      return s.budgets.filter((b:any)=>b.month===month).map((b:any)=>{
        const usage = calculateBudgetUsage({ budget: b, transactions: s.transactions, recurringExpenses: s.recurringExpenses })
        return { id:b.id, category:b.category, month:b.month, limitCents:b.limitCents, limit:money(b.limitCents), realizedCents:usage.realizedCents, realized:money(usage.realizedCents), committedCents:usage.committedCents, committed:money(usage.committedCents), projectedCents:usage.projectedCents, projected:money(usage.projectedCents), remainingCents:usage.remainingCents, remaining:money(usage.remainingCents), percentProjected:usage.percentProjected }
      })
    }
  },
  {
    type: 'function',
    function: { name: 'getBudgetStatus', description: 'Status de orçamento baseado no valor projetado: realizado + comprometido.', parameters: { type: 'object', properties: { month: { type: 'string' } }, required: [] } },
    _zod: getBudgetStatusSchema,
    _execute: async (args:any) => {
      const s = useFinanceStore.getState() as any
      const month = args.month ?? today().slice(0,7)
      return s.budgets.filter((b:any)=>b.month===month).map((b:any)=>{
        const usage = calculateBudgetUsage({ budget:b, transactions:s.transactions, recurringExpenses:s.recurringExpenses })
        const status = usage.percentProjected>=100 ? 'exceeded' : usage.percentProjected>=80 ? 'warning' : 'ok'
        return { id:b.id, category:b.category, limit:money(b.limitCents), realized:money(usage.realizedCents), committed:money(usage.committedCents), projected:money(usage.projectedCents), remaining:money(usage.remainingCents), percent:usage.percentProjected, status }
      })
    }
  },
  {
    type: 'function',
    function: { name: 'getGoals', description: 'Lista metas financeiras.', parameters: { type: 'object', properties: {}, required: [] } },
    _zod: getGoalsSchema,
    _execute: async () => {
      const s = useFinanceStore.getState() as any
      return (s.goals ?? []).map((g:any)=>({ id:g.id, title:g.title, targetCents:g.targetAmountInCents, target:money(g.targetAmountInCents), currentCents:g.currentAmountInCents, current:money(g.currentAmountInCents), progress: g.targetAmountInCents? Math.round(g.currentAmountInCents/g.targetAmountInCents*100):0, deadline:g.deadline }))
    }
  },
  {
    type: 'function',
    function: { name: 'getCashFlowForecast', description: 'Previsão de saldo com receitas/despesas recorrentes e média variável opcional.', parameters: { type: 'object', properties: { days: { type: 'number' }, realistic: { type: 'boolean' } }, required: [] } },
    _zod: getCashFlowForecastSchema,
    _execute: async (args:any) => getCashFlow(args.days ?? 30, args.realistic ?? true)
  },
  {
    type: 'function',
    function: { name: 'getAvailableMoney', description: 'Saldo disponível após despesas recorrentes futuras e reservas virtuais. Para o cálculo completo de dinheiro livre use getFreeMoney.', parameters: { type: 'object', properties: { untilDate: { type: 'string' } }, required: [] } },
    _zod: getAvailableMoneySchema,
    _execute: async (args:any) => calculateAvailableMoney(args.untilDate)
  },
  {
    type: 'function',
    function: { name: 'getSpendingAnalysis', description: 'Análise de despesas realizadas, não inclui compromissos ainda não pagos.', parameters: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, groupBy: { type: 'string', enum: ['category','month'] } }, required: [] } },
    _zod: getSpendingAnalysisSchema,
    _execute: async (args:any) => analyzeSpending(args.startDate, args.endDate, args.groupBy ?? 'category')
  },
  {
    type: 'function',
    function: { name: 'getSpendingAnomalies', description: 'Detecta categorias com despesas realizadas muito acima da média.', parameters: { type: 'object', properties: { months: { type: 'number' } }, required: [] } },
    _zod: getSpendingAnomaliesSchema,
    _execute: async (args:any) => ({ anomalies: detectAnomalies(args.months ?? 6) })
  },
  {
    type: 'function',
    function: { name: 'getNextIncome', description: 'Próxima ocorrência de receita recorrente ainda não recebida.', parameters: { type: 'object', properties: {}, required: [] } },
    _zod: getNextIncomeSchema,
    _execute: async () => calculateNextIncome()
  },
]
