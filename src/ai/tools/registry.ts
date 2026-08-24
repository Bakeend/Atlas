import { readTools } from './readTools'
import { transactionTools } from './transactionTools'
import { categoryTools } from './categoryTools'
import { recurringTools } from './recurringTools'
import { budgetTools } from './budgetTools'
import { goalTools } from './goalTools'
import { accountTools } from './accountTools'
import { allocationTools } from './allocationTools'
import { safeSpendTools } from './safeSpendTools'
import { paymentAllocationTools } from './paymentAllocationTools'
import { freeMoneyTools } from './freeMoneyTools'
import { requiresConfirmation } from '../permissions/confirmationPolicy'

export const allToolDefs = [
  ...readTools,
  ...transactionTools,
  ...categoryTools,
  ...recurringTools,
  ...budgetTools,
  ...goalTools,
  ...accountTools,
  ...allocationTools,
  ...safeSpendTools,
  ...paymentAllocationTools,
  ...freeMoneyTools,
]

// Map for executor
export const toolExecutors = new Map<string, (args:any)=> Promise<unknown> | unknown>()
for (const t of allToolDefs) toolExecutors.set(t.function.name, t._execute as any)

// Export sanitized OpenRouter tools (without _zod/_execute)
export const openRouterTools = allToolDefs.map(t => ({
  type: t.type,
  function: {
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }
}))

export interface ExecuteOptions { confirmed?: boolean }

export async function executeTool(name: string, args: Record<string,unknown>, options: ExecuteOptions = {}): Promise<{ success: boolean; result?: unknown; error?: string; requiresConfirmation?: boolean }> {
  const exec = toolExecutors.get(name)
  if (!exec) return { success: false, error: `Tool não encontrada: ${name}` }
  // Confirmação nunca vem do modelo: strip antes de qualquer validação/execução
  const cleanArgs = { ...args }
  delete (cleanArgs as any)._confirmed
  if (requiresConfirmation(name) === 'explicit' && !options.confirmed) {
    return { success: false, requiresConfirmation: true, error: `Ação destrutiva "${name}" requer confirmação explícita do usuário.` }
  }
  try {
    const def = allToolDefs.find(t=> t.function.name===name)
    if (def?._zod) def._zod.parse(cleanArgs)
    const result = await exec(cleanArgs)
    return { success: true, result }
  } catch (e:any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}
