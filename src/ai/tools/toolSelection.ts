import { openRouterTools } from './registry'

type ToolBag = typeof openRouterTools

// Grupos por domínio — enviados ao modelo somente quando a intenção bate (custo/token)
const GROUPS: Array<{ keywords: string[]; tools: string[] }> = [
  {
    keywords: ['gastei', 'gasto', 'paguei', 'pagamento de', 'comprei', 'compra', 'despesa', 'recebi', 'receita', 'transferi', 'transferência', 'transferencia', 'registra', 'registrar', 'anota', 'lança', 'lancei'],
    tools: ['createTransaction', 'updateTransaction', 'deleteTransaction'],
  },
  {
    keywords: ['recorrente', 'recoente', 'recorente', 'recorrent', 'reco', 'todo mês', 'todo mes', 'toda semana', 'todo dia', 'todos os meses', 'fixo', 'fixa', 'mensal', 'semanal', 'anual', 'salário fixo', 'salario fixo', 'netflix', 'spotify', 'chatgpt', 'assinatura', 'mensalidade'],
    tools: ['createRecurringExpense', 'updateRecurringExpense', 'pauseRecurringExpense', 'resumeRecurringExpense', 'deleteRecurringExpense', 'getRecurringExpenses', 'createRecurringIncome', 'updateRecurringIncome', 'deleteRecurringIncome', 'getRecurringIncome'],
  },
  {
    keywords: ['categoria'],
    tools: ['createCategory', 'updateCategory', 'deleteCategory'],
  },
  {
    keywords: ['meta', 'objetivo', 'poupança', 'poupanca', 'guardar'],
    tools: ['createGoal', 'updateGoal', 'deleteGoal', 'getGoals'],
  },
  {
    keywords: ['orçamento', 'orcamento', 'limite'],
    tools: ['createBudget', 'updateBudget', 'deleteBudget', 'getBudgets', 'getBudgetStatus'],
  },
  {
    keywords: ['organizar', 'organiza', 'organização', 'organizacao', 'distribuir', 'dividir o', 'plano', 'planejar', 'reserve', 'reservar'],
    tools: ['preparePaymentAllocationPlan', 'applyPaymentAllocationPlan', 'cancelPaymentAllocationPlan', 'updatePaymentAllocationItem', 'getPaymentAllocationPlan', 'createAllocationPlan', 'applyAllocationPlan', 'deleteAllocationPlan'],
  },
  {
    keywords: ['dinheiro livre', 'livre', 'disponível', 'disponivel', 'posso gastar', 'quanto resta'],
    tools: ['getFreeMoney', 'getFreeMoneyBreakdown', 'getAvailableMoney', 'getCommittedAmount'],
  },
  {
    keywords: ['hoje', 'por dia', 'diário', 'diario', 'seguro', 'restam'],
    tools: ['getSafeDailySpend', 'simulateDailySpend'],
  },
  {
    keywords: ['previsão', 'previsao', 'projeção', 'projecao', 'futuro', 'próximos dias', 'proximos dias', 'em 30 dias', 'em 90 dias'],
    tools: ['getCashFlowForecast', 'getUpcomingCommitments'],
  },
  {
    keywords: ['analise', 'analisa', 'análise', 'analise meus gastos', 'comparar', 'anomalia', 'variação', 'variacao', 'padrão', 'padrao', 'onde estou gastando'],
    tools: ['getSpendingAnalysis', 'getSpendingAnomalies', 'getTransactionsByCategory'],
  },
  {
    keywords: ['conta', 'carteira'],
    tools: ['createAccount', 'updateAccount', 'deleteAccount'],
  },
]

// Núcleo sempre disponível — leituras essenciais + escrita mais comum
const CORE_TOOLS = [
  'getFinancialSummary',
  'getAccounts',
  'getAccountBalances',
  'getCategories',
  'getTransactions',
  'getNextIncome',
  'createTransaction',
  'updateTransaction',
]

export function selectToolsForMessage(userMessage: string): ToolBag {
  const text = (userMessage ?? '').toLowerCase()
  const wanted = new Set(CORE_TOOLS)
  for (const group of GROUPS) {
    if (!group.keywords.some(keyword => text.includes(keyword))) continue
    for (const name of group.tools) wanted.add(name)
  }
  const selected = openRouterTools.filter(tool => wanted.has(tool.function.name))
  return selected.length ? selected : openRouterTools.filter(tool => CORE_TOOLS.includes(tool.function.name))
}
