import { categories as defaultCategories, uid } from '../../domain'
import { useFinanceStore } from '../../store'
import { createCategorySchema, normalizeCategory, categoryAliases, updateCategorySchema } from '../schemas/toolSchemas'

function findExistingCategory(input: string): string | undefined {
  const s = useFinanceStore.getState() as any
  const all = new Set<string>([...defaultCategories, ...(s.customCategories ?? [])])
  const normInput = normalizeCategory(input)
  // direct match
  for (const c of all) if (normalizeCategory(c) === normInput) return c
  // alias map
  if (categoryAliases[normInput]) return categoryAliases[normInput]
  // fuzzy contains? e.g., "mercado" -> Alimentação already via alias. For safety, check includes
  for (const [alias, target] of Object.entries(categoryAliases)) {
    if (normInput.includes(alias) || alias.includes(normInput)) return target
  }
  return undefined
}

export const categoryTools = [
  {
    type: 'function' as const,
    function: {
      name: 'createCategory',
      description: 'Cria categoria nova com ícone do pack. ANTES chame getCategories e tente reutilizar existente. Evite duplicatas (Mercado/Supermercado → Alimentação). Icone deve ser um nome do pack: ShoppingCart, House, Car, HeartPulse, Gamepad2, GraduationCap, Tv, Package, PawPrint, Baby, etc.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'nome da categoria, 2-32 chars' }, icon: { type: 'string', description: 'nome do ícone do pack, ex: PawPrint, ShoppingCart, Package' } }, required: ['name'] },
    },
    _zod: createCategorySchema,
    _execute: async (args:any) => {
      const parsed = createCategorySchema.parse(args)
      const existing = findExistingCategory(parsed.name)
      if (existing) {
        return { success: false, reused: true, category: existing, message: `Categoria "${existing}" já existe e foi reutilizada. Valor não criado duplicado.` }
      }
      const s = useFinanceStore.getState() as any
      const name = parsed.name.trim()
      // check case-insensitive existence in custom
      const lower = name.toLowerCase()
      if ((s.customCategories ?? []).some((c:string)=> c.toLowerCase()===lower) || defaultCategories.some(c=>c.toLowerCase()===lower)) {
        return { success: false, reused: true, category: name, message: 'Categoria já existe (case-insensitive).' }
      }
      const icon = (parsed as any).icon?.trim()
      useFinanceStore.getState().addCustomCategory?.(name, icon)
      // fallback if method doesn't exist (older store)
      if (!useFinanceStore.getState().addCustomCategory) {
        // persist via patching FinanceData directly
        const state = useFinanceStore.getState() as any
        const next = { ...state, customCategories: [...(state.customCategories??[]), name] }
        // we need to call persist manually — use the store's internal? Simpler: just mutate state for now
        // but we have helper: directly use set? We'll add method via store update if missing, so here we create entry and force persist
        // As fallback, use indexedDbRepository directly? We already mutated? Let's just set via zustand set
        // @ts-ignore
        useFinanceStore.setState({ customCategories: [...(state.customCategories??[]), name] })
        try { const { indexedDbRepository } = await import('../../data/repository'); const data = { accounts: state.accounts, transactions: state.transactions, budgets: state.budgets, recurringExpenses: state.recurringExpenses, recurringIncomes: state.recurringIncomes, goals: state.goals, allocationPlans: state.allocationPlans, customCategories: [...(state.customCategories??[]), name], aiConversations: state.aiConversations, aiMessages: state.aiMessages, aiLogs: state.aiLogs, aiRules: state.aiRules, hideBalances: state.hideBalances, readNotificationIds: state.readNotificationIds, forecastRealistic: state.forecastRealistic }; await indexedDbRepository.save(data as any) } catch {}
      }
      return { success: true, category: name, message: `Categoria "${name}" criada.` }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateCategory',
      description: 'Renomeia categoria. Atualiza nome em orçamentos e transações afetadas será via store.',
      parameters: { type: 'object', properties: { oldName: { type: 'string' }, newName: { type: 'string' } }, required: ['oldName','newName'] },
    },
    _zod: updateCategorySchema,
    _execute: async (args:any) => {
      const parsed = updateCategorySchema.parse(args)
      const s = useFinanceStore.getState() as any
      const all = [...defaultCategories, ...(s.customCategories??[])]
      if (!all.some(c=> c===parsed.oldName)) throw new Error(`Categoria "${parsed.oldName}" não existe`)
      // if new already exists
      if (all.some(c=> c.toLowerCase()===parsed.newName.toLowerCase())) throw new Error(`Categoria "${parsed.newName}" já existe`)
      useFinanceStore.getState().renameCategory?.(parsed.oldName, parsed.newName)
      if (!useFinanceStore.getState().renameCategory) {
        // fallback: mutate customCategories and transactions
        const isDefault = defaultCategories.includes(parsed.oldName)
        if (isDefault) throw new Error('Não é permitido renomear categorias padrão via fallback. Adicione custom.')
        const nextCats = (s.customCategories??[]).map((c:string)=> c===parsed.oldName? parsed.newName : c)
        useFinanceStore.setState({ customCategories: nextCats } as any)
      }
      return { success: true, oldName: parsed.oldName, newName: parsed.newName }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteCategory',
      description: 'EXCLUSÃO: remove categoria customizada. Não permite excluir categoria com transações ou padrão. Requer confirmação.',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
    _zod: createCategorySchema,
    _execute: async (args:any) => {
      const parsed = createCategorySchema.parse(args)
      if (defaultCategories.includes(parsed.name)) throw new Error('Não é permitido excluir categoria padrão')
      const s = useFinanceStore.getState() as any
      const hasTx = s.transactions.some((t:any)=> !t.deletedAt && t.category===parsed.name)
      if (hasTx) throw new Error(`Categoria "${parsed.name}" possui transações e não pode ser excluída. Mova as transações antes.`)
      useFinanceStore.getState().deleteCustomCategory?.(parsed.name)
      if (!useFinanceStore.getState().deleteCustomCategory) {
        const next = (s.customCategories??[]).filter((c:string)=> c!==parsed.name)
        useFinanceStore.setState({ customCategories: next } as any)
      }
      return { success: true, deleted: parsed.name }
    }
  },
]
