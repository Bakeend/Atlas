export type ConfirmationLevel = 'none' | 'preview' | 'explicit'

export interface PermissionRule {
  pattern: RegExp | string
  level: ConfirmationLevel
  reason: string
}

const destructiveTools = new Set([
  'deleteTransaction',
  'deleteCategory',
  'deleteRecurringExpense',
  'deleteRecurringIncome',
  'deleteBudget',
  'deleteGoal',
  'deleteAccount',
  'deleteAllocationPlan',
])

const bulkTools = new Set([
  'createAllocationPlan',
  'applyAllocationPlan',
  'preparePaymentAllocationPlan',
])

const explicitTools = new Set([
  'applyPaymentAllocationPlan',
  'cancelPaymentAllocationPlan',
])

// Tools that are read-only never need confirmation
const readTools = new Set([
  'getFinancialSummary',
  'getAccounts',
  'getAccountBalances',
  'getTransactions',
  'getTransactionsByPeriod',
  'getTransactionsByCategory',
  'getCategories',
  'getRecurringExpenses',
  'getRecurringIncome',
  'getUpcomingCommitments',
  'getBudgets',
  'getBudgetStatus',
  'getGoals',
  'getCashFlowForecast',
  'getAvailableMoney',
  'getCommittedAmount',
  'getFreeMoney',
  'getFreeMoneyBreakdown',
  'getSpendingAnalysis',
  'getSpendingAnomalies',
  'getNextIncome',
])

export function requiresConfirmation(toolName: string, args?: Record<string, unknown>): ConfirmationLevel {
  if (readTools.has(toolName)) return 'none'
  if (destructiveTools.has(toolName)) return 'explicit'
  if (explicitTools.has(toolName)) return 'explicit'
  if (bulkTools.has(toolName)) return 'preview'
  // Heuristic: large batch via create* with many? we treat single creates as none if explicitly requested
  // But if tool is createTransaction with explicit user intent, allow none — UI will still show undo
  // We signal preview for allocation-related mutating mass
  if (toolName === 'createBudget' || toolName === 'updateBudget') {
    // changing many budgets could be bulk — but single budget is fine
    return 'none'
  }
  // Default: write without preview, but UI can still ask if > 3 tool calls in one turn?
  return 'none'
}

export function isDestructive(toolName: string): boolean {
  return destructiveTools.has(toolName)
}

export function isReadOnly(toolName: string): boolean {
  return readTools.has(toolName)
}

export function describeConfirmation(level: ConfirmationLevel): string {
  switch (level) {
    case 'none': return 'Sem confirmação extra'
    case 'preview': return 'Requer preview e confirmação'
    case 'explicit': return 'Requer confirmação explícita'
  }
}
