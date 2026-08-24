import { z } from 'zod'

// — Safe actions (01:34) — enum restrita, nunca HTML/JS arbitrário
export const AiActionTypeSchema = z.enum([
  'create-category',
  'update-category',
  'delete-category',
  'create-transaction',
  'update-transaction',
  'delete-transaction',
  'create-recurring',
  'update-recurring',
  'delete-recurring',
  'create-budget',
  'apply-plan',
  'apply-allocation',
  'open-category',
  'open-transactions',
  'open-recurring',
  'open-budget',
  'retry',
  'cancel',
  'edit-plan',
  'confirm',
])

export type AiActionType = z.infer<typeof AiActionTypeSchema>

export const AiActionSchema = z.object({
  type: AiActionTypeSchema,
  label: z.string().min(1).max(40),
  payload: z.unknown().optional(),
  entityId: z.string().optional(),
})

export type AiAction = z.infer<typeof AiActionSchema>

// — Visual Blocks (01:22-32) — cada bloco validado via Zod antes de renderizar (01:58)
export const MetricBlockSchema = z.object({
  type: z.literal('metric'),
  title: z.string(),
  value: z.string(),
  subtitle: z.string().optional(),
  delta: z.object({ value: z.number(), label: z.string().optional() }).optional(),
  chart: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
  actions: z.array(AiActionSchema).optional(),
})

export const CategoryBlockSchema = z.object({
  type: z.literal('category'),
  title: z.string().optional(),
  categoryId: z.string().optional(),
  label: z.string(),
  value: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export const ChartBlockSchema = z.object({
  type: z.literal('chart'),
  title: z.string(),
  chartType: z.enum(['line', 'bar', 'pie']).default('line'),
  data: z.array(z.object({ label: z.string(), value: z.number() })),
})

export const TransactionListBlockSchema = z.object({
  type: z.literal('transactions'),
  title: z.string(),
  items: z.array(z.object({
    id: z.string(),
    description: z.string(),
    amountCents: z.number().int(),
    category: z.string(),
    date: z.string(),
    type: z.enum(['income', 'expense', 'transfer']).optional(),
  })),
  maxItems: z.number().int().min(1).max(10).optional(),
  actions: z.array(AiActionSchema).optional(),
})

export const BudgetBlockSchema = z.object({
  type: z.literal('budget'),
  categoryId: z.string().optional(),
  label: z.string(),
  usedInCents: z.number().int().min(0),
  limitInCents: z.number().int().min(0),
  percentage: z.number().min(0).max(1000),
  remainingInCents: z.number().int().optional(),
})

export const RecurringBlockSchema = z.object({
  type: z.literal('recurring'),
  recurringId: z.string(),
  label: z.string(),
  amountInCents: z.number().int(),
  dueLabel: z.string(),
  category: z.string().optional(),
  frequency: z.string().optional(),
  actions: z.array(AiActionSchema).optional(),
})

export const FinancialPlanBlockSchema = z.object({
  type: z.literal('plan'),
  title: z.string(),
  items: z.array(z.object({ label: z.string(), amountCents: z.number().int(), type: z.string().optional() })),
  actions: z.array(AiActionSchema).optional(),
})

export const EntityPreviewBlockSchema = z.object({
  type: z.literal('entity-preview'),
  entityType: z.enum(['category', 'transaction', 'recurring', 'budget', 'goal', 'account']),
  operation: z.enum(['create', 'update', 'delete']),
  title: z.string(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  confirmationRequired: z.boolean().optional().default(true),
})

export const ConfirmationBlockSchema = z.object({
  type: z.literal('confirmation'),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['normal', 'danger']).default('normal'),
  confirmAction: AiActionSchema,
  cancelAction: AiActionSchema.optional(),
})

export const SuccessBlockSchema = z.object({
  type: z.literal('success'),
  title: z.string(),
  description: z.string().optional(),
  entity: z.object({ type: z.string(), id: z.string() }).optional(),
})

export const ErrorBlockSchema = z.object({
  type: z.literal('error'),
  title: z.string(),
  description: z.string(),
  retryAction: AiActionSchema.optional(),
})

export const FormBlockSchema = z.object({
  type: z.literal('form'),
  title: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(['text', 'number', 'select', 'color']).default('text'),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  })),
  submitAction: AiActionSchema.optional(),
  cancelAction: AiActionSchema.optional(),
})

// Discriminated union — validação central (01:58)
export const AiVisualBlockSchema = z.discriminatedUnion('type', [
  MetricBlockSchema,
  CategoryBlockSchema,
  ChartBlockSchema,
  TransactionListBlockSchema,
  BudgetBlockSchema,
  RecurringBlockSchema,
  FinancialPlanBlockSchema,
  EntityPreviewBlockSchema,
  ConfirmationBlockSchema,
  SuccessBlockSchema,
  ErrorBlockSchema,
  FormBlockSchema,
])

export type AiVisualBlock = z.infer<typeof AiVisualBlockSchema>

// — Presentation que vai dentro da mensagem da assistente (01:45, 01:54)
export const AiPresentationSchema = z.object({
  speech: z.string().optional(), // otimizado para TTS (curto)
  text: z.string().optional(), // texto do bubble
  summary: z.string().optional(),
  blocks: z.array(AiVisualBlockSchema).max(6).default([]), // 01:54 máx 1 dashboard + 1 complementar + ações
  actions: z.array(AiActionSchema).max(3).optional(),
})

export type AiPresentation = z.infer<typeof AiPresentationSchema>

// — Estados do chat (01:46)
export const ChatRequestStateSchema = z.enum([
  'idle',
  'transcribing',
  'processing',
  'awaiting-confirmation',
  'executing-action',
  'responding',
  'error',
])

export type ChatRequestState = z.infer<typeof ChatRequestStateSchema>

// — Ação pendente (01:49) — type guarda o NOME DA TOOL a executar com confirmed:true
export interface PendingAction {
  id: string
  type: string
  payload: unknown
  confirmationRequired: boolean
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'failed'
  createdAt: string
}

// — Contexto visual (01:51)
export interface ChatVisualContext {
  visibleBlocks: string[]
  focusedEntity?: { type: string; id: string }
  pendingAction?: PendingAction
  lastAssistantPresentation?: AiPresentation
}

// Helper: valida presentation vinda da IA, ignora blocos inválidos sem quebrar chat (01:58)
export function parsePresentation(raw: unknown): AiPresentation | null {
  const parsed = AiPresentationSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  // tenta recuperar parcialmente: se blocks inválidos, mantém texto
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>
    const blocks = Array.isArray(r.blocks) ? r.blocks.flatMap(b => {
      const p = AiVisualBlockSchema.safeParse(b)
      return p.success ? [p.data] : []
    }) : []
    return {
      speech: typeof r.speech === 'string' ? r.speech : undefined,
      text: typeof r.text === 'string' ? r.text : undefined,
      summary: typeof r.summary === 'string' ? r.summary : undefined,
      blocks,
      actions: Array.isArray(r.actions) ? r.actions.flatMap(a => {
        const p = AiActionSchema.safeParse(a)
        return p.success ? [p.data] : []
      }) : undefined,
    }
  }
  return null
}
