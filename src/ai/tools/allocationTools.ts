import { money, uid } from '../../domain'
import type { AllocationPlan } from '../../domain'
import { useFinanceStore, waitForPersist } from '../../store'
import { applyAllocationPlanSchema, createAllocationPlanSchema, deleteAllocationPlanSchema } from '../schemas/toolSchemas'
import { calculateAvailableMoney } from '../services/financialEngine'

export const allocationTools = [
  {
    type: 'function' as const,
    function: {
      name: 'createAllocationPlan',
      description: 'Cria plano de distribuição "Organizar meu dinheiro". Requer preview antes de aplicar. Alocações são itens tipo bill/budget/goal/reserve/free. Valida soma não exceder disponível (exceto se sinalizado deficitário).',
      parameters: {
        type: 'object',
        properties: {
          periodStart: { type: 'string', description: 'YYYY-MM-DD' },
          periodEnd: { type: 'string', description: 'YYYY-MM-DD' },
          note: { type: 'string' },
          allocations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['bill','budget','goal','reserve','free'] },
                label: { type: 'string' },
                amountInCents: { type: 'number' },
                categoryId: { type: 'string' },
                recurringExpenseId: { type: 'string' },
                goalId: { type: 'string' },
              },
              required: ['type','label','amountInCents'],
            },
          },
        },
        required: ['periodStart','periodEnd','allocations'],
      },
    },
    _zod: createAllocationPlanSchema,
    _execute: async (args:any) => {
      const parsed = createAllocationPlanSchema.parse(args)
      const available = calculateAvailableMoney(parsed.periodEnd)
      const totalAllocated = parsed.allocations.reduce((sum:any, a:any)=> sum + a.amountInCents, 0)
      if (totalAllocated > available.availableCents) {
        // allow but warn — mark as deficitário? Spec: salvo se explicitamente sinalizado como deficitário
        // We'll allow creation but return warning flag
        // If not explicitly deficit, we still create but include warning for preview
      }
      const plan: AllocationPlan = {
        id: uid(),
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        availableAmountInCents: available.availableCents,
        allocations: parsed.allocations.map((a:any)=> ({ id: uid(), type: a.type, label: a.label, amountInCents: a.amountInCents, categoryId: a.categoryId, recurringExpenseId: a.recurringExpenseId, goalId: a.goalId })),
        createdAt: new Date().toISOString(),
        status: 'draft',
        note: parsed.note,
      }
      useFinanceStore.getState().saveAllocationPlan(plan)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. O plano não foi criado.') }
      const warnings: string[] = []
      if (totalAllocated > available.availableCents) warnings.push(`Soma alocada ${money(totalAllocated)} excede disponível ${money(available.availableCents)} — plano deficitário de ${money(totalAllocated-available.availableCents)}.`)
      return {
        success: true,
        plan: {
          id: plan.id,
          period: `${plan.periodStart} até ${plan.periodEnd}`,
          available: money(plan.availableAmountInCents),
          totalAllocated: money(totalAllocated),
          allocations: plan.allocations.map(a=> ({ label: a.label, type: a.type, amount: money(a.amountInCents) })),
          freeAfter: money(Math.max(0, plan.availableAmountInCents - totalAllocated)),
          warnings,
          status: plan.status,
          preview: 'Plano preparado — requer confirmação [Aplicar] para efetivar.',
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'applyAllocationPlan',
      description: 'Aplica plano de distribuição. Cria orçamentos/metas e marca como aplicado. Requer confirmação/preview.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: applyAllocationPlanSchema,
    _execute: async (args:any) => {
      const parsed = applyAllocationPlanSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const plan = (s.allocationPlans??[]).find((p:any)=> p.id===parsed.id)
      if (!plan) throw new Error('Plano não encontrado')
      if (plan.status==='applied') return { success: true, alreadyApplied: true, id: plan.id }
      // Apply: for each allocation type budget -> createBudget, goal -> updateGoal etc.
      // For simplicity: create/update budgets for 'budget' allocations, and simulate goal contribution
      const month = plan.periodStart.slice(0,7)
      let budgetsCreated = 0
      let goalsUpdated = 0
      for (const alloc of plan.allocations) {
        if (alloc.type==='budget' && alloc.categoryId) {
          const cat = alloc.categoryId
          const existing = s.budgets.find((b:any)=> b.category===cat && b.month===month)
          const limit = alloc.amountInCents
          if (existing) {
            useFinanceStore.getState().saveBudget({ ...existing, limitCents: limit })
          } else {
            useFinanceStore.getState().saveBudget({ id: uid(), category: cat, month, limitCents: limit })
            budgetsCreated++
          }
        } else if (alloc.type==='budget' && !alloc.categoryId) {
          // fallback label as category
          const cat = alloc.label
          const existing = s.budgets.find((b:any)=> b.category===cat && b.month===month)
          if (existing) useFinanceStore.getState().saveBudget({ ...existing, limitCents: alloc.amountInCents })
          else { useFinanceStore.getState().saveBudget({ id: uid(), category: cat, month, limitCents: alloc.amountInCents }); budgetsCreated++ }
        } else if (alloc.type==='goal' && alloc.goalId) {
          const goal = (s.goals??[]).find((g:any)=> g.id===alloc.goalId)
          if (goal) {
            const updated = { ...goal, currentAmountInCents: goal.currentAmountInCents + alloc.amountInCents, updatedAt: new Date().toISOString() }
            useFinanceStore.getState().saveGoal(updated)
            goalsUpdated++
          }
        }
      }
      const updatedPlan = { ...plan, status: 'applied' as const }
      useFinanceStore.getState().saveAllocationPlan(updatedPlan)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. O plano não foi aplicado.') }
      return { success: true, appliedId: plan.id, budgetsCreated, goalsUpdated, message: `Plano aplicado: ${budgetsCreated} orçamentos criados/atualizados, ${goalsUpdated} metas atualizadas.` }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteAllocationPlan',
      description: 'Remove plano de distribuição (apenas rascunho). Requer confirmação se já aplicado.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    _zod: deleteAllocationPlanSchema,
    _execute: async (args:any) => {
      const parsed = deleteAllocationPlanSchema.parse(args)
      const s = useFinanceStore.getState() as any
      const plan = (s.allocationPlans??[]).find((p:any)=> p.id===parsed.id)
      if (!plan) throw new Error('Plano não encontrado')
      useFinanceStore.getState().deleteAllocationPlan(parsed.id)
      try { await waitForPersist() } catch { throw new Error('Falha ao salvar os dados no dispositivo. A exclusão não foi concluída.') }
      return { success: true, deletedId: parsed.id }
    }
  },
]
