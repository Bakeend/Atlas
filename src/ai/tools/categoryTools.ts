import { categories as defaultCategories } from '../../domain'
import { useFinanceStore, waitForPersist } from '../../store'
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
      useFinanceStore.getState().addCustomCategory(name, icon)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. A categoria não foi criada.') }
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
      useFinanceStore.getState().renameCategory(parsed.oldName, parsed.newName)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. A renomeação não foi concluída.') }
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
      useFinanceStore.getState().deleteCustomCategory(parsed.name)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. A exclusão não foi concluída.') }
      return { success: true, deleted: parsed.name }
    }
  },
]
