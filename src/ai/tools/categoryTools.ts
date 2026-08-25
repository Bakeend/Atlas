import { categories as defaultCategories } from '../../domain'
import { useFinanceStore, waitForPersist } from '../../store'
import { createCategorySchema, normalizeCategory, categoryAliases, updateCategorySchema } from '../schemas/toolSchemas'

function findExistingCategory(input: string): string | undefined {
  const s = useFinanceStore.getState() as any
  const all = new Set<string>([...defaultCategories, ...(s.customCategories ?? [])])
  const normInput = normalizeCategory(input)
  for (const c of all) if (normalizeCategory(c) === normInput) return c
  if (categoryAliases[normInput]) return categoryAliases[normInput]
  for (const [alias, target] of Object.entries(categoryAliases)) if (normInput.includes(alias) || alias.includes(normInput)) return target
  return undefined
}

function categoryReferences(name: string, state = useFinanceStore.getState() as any) {
  return {
    transactions: state.transactions.some((t:any)=> !t.deletedAt && t.category===name),
    budgets: state.budgets.some((b:any)=> b.category===name),
    recurringExpenses: state.recurringExpenses.some((r:any)=> r.category===name),
    recurringIncomes: (state.recurringIncomes ?? []).some((r:any)=> r.category===name),
    goals: (state.goals ?? []).some((g:any)=> g.category===name),
    allocationPlans: (state.allocationPlans ?? []).some((p:any)=> p.allocations?.some((i:any)=> i.categoryId===name)),
    paymentAllocationPlans: (state.paymentAllocationPlans ?? []).some((p:any)=> p.items?.some((i:any)=> i.categoryId===name)),
    aiRules: (state.aiRules ?? []).some((r:any)=> r.type==='category_mapping' && r.targetId===name),
  }
}

export const categoryTools = [
  {
    type: 'function' as const,
    function: { name: 'createCategory', description: 'Cria categoria nova com ícone do pack. Antes, reutilize categorias equivalentes existentes.', parameters: { type: 'object', properties: { name: { type: 'string' }, icon: { type: 'string' } }, required: ['name'] } },
    _zod: createCategorySchema,
    _execute: async (args:any) => {
      const parsed = createCategorySchema.parse(args)
      const existing = findExistingCategory(parsed.name)
      if (existing) return { success: false, reused: true, category: existing, message: `Categoria "${existing}" já existe e foi reutilizada.` }
      const name = parsed.name.trim()
      useFinanceStore.getState().addCustomCategory(name, parsed.icon?.trim())
      await waitForPersist()
      return { success: true, category: name }
    }
  },
  {
    type: 'function' as const,
    function: { name: 'updateCategory', description: 'Renomeia uma categoria e atualiza todas as referências financeiras relacionadas.', parameters: { type: 'object', properties: { oldName: { type: 'string' }, newName: { type: 'string' } }, required: ['oldName','newName'] } },
    _zod: updateCategorySchema,
    _execute: async (args:any) => {
      const parsed = updateCategorySchema.parse(args)
      const s = useFinanceStore.getState() as any
      const all = [...defaultCategories, ...(s.customCategories??[])]
      if (!all.includes(parsed.oldName)) throw new Error(`Categoria "${parsed.oldName}" não existe`)
      if (all.some(c=> c.toLowerCase()===parsed.newName.toLowerCase())) throw new Error(`Categoria "${parsed.newName}" já existe`)
      useFinanceStore.getState().renameCategory(parsed.oldName, parsed.newName)
      const after = useFinanceStore.getState() as any
      for (const goal of (after.goals ?? []).filter((g:any)=>g.category===parsed.oldName)) after.saveGoal({ ...goal, category: parsed.newName, updatedAt: new Date().toISOString() })
      for (const plan of (after.allocationPlans ?? [])) {
        if (!plan.allocations?.some((item:any)=>item.categoryId===parsed.oldName)) continue
        after.saveAllocationPlan({ ...plan, allocations: plan.allocations.map((item:any)=> item.categoryId===parsed.oldName ? { ...item, categoryId: parsed.newName } : item) })
      }
      for (const plan of (after.paymentAllocationPlans ?? [])) {
        if (!plan.items?.some((item:any)=>item.categoryId===parsed.oldName)) continue
        after.savePaymentAllocationPlan({ ...plan, items: plan.items.map((item:any)=> item.categoryId===parsed.oldName ? { ...item, categoryId: parsed.newName } : item), updatedAt: new Date().toISOString() })
      }
      await waitForPersist()
      return { success: true, oldName: parsed.oldName, newName: parsed.newName }
    }
  },
  {
    type: 'function' as const,
    function: { name: 'deleteCategory', description: 'Exclui categoria customizada somente quando não existe nenhuma referência financeira. Requer confirmação.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    _zod: createCategorySchema,
    _execute: async (args:any) => {
      const parsed = createCategorySchema.parse(args)
      if (defaultCategories.includes(parsed.name)) throw new Error('Não é permitido excluir categoria padrão')
      const s = useFinanceStore.getState() as any
      if (!(s.customCategories ?? []).includes(parsed.name)) throw new Error('Categoria customizada não encontrada')
      const refs = categoryReferences(parsed.name, s)
      const usedBy = Object.entries(refs).filter(([,used])=>used).map(([key])=>key)
      if (usedBy.length) throw new Error(`Categoria "${parsed.name}" ainda é usada por: ${usedBy.join(', ')}. Renomeie ou mova essas referências antes de excluir.`)
      useFinanceStore.getState().deleteCustomCategory(parsed.name)
      await waitForPersist()
      return { success: true, deleted: parsed.name }
    }
  },
]
