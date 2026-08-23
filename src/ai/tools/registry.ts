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

export async function executeTool(name: string, args: Record<string,unknown>): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const exec = toolExecutors.get(name)
  if (!exec) return { success: false, error: `Tool não encontrada: ${name}` }
  try {
    // find zod to validate (optional, exec will also validate)
    const def = allToolDefs.find(t=> t.function.name===name)
    if (def?._zod) def._zod.parse(args)
    const result = await exec(args)
    return { success: true, result }
  } catch (e:any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}
