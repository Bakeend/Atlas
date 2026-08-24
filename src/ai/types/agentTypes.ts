export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AgentMessage {
  role: ChatRole
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

export interface AgentLoopOptions {
  maxIterations?: number
  signal?: AbortSignal
  onStep?: (step: string) => void
  conversationId?: string
  alreadyExecuted?: string[]
}

export interface AgentResult {
  content: string
  toolCallsExecuted: Array<{ name: string; args: Record<string, unknown>; result: unknown }>
  pendingConfirmations?: PendingConfirmation[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

// Erro com contexto do que já foi executado — evita duplicação em retry
export class AgentExecutionError extends Error {
  executedToolNames: string[]
  constructor(message: string, executedToolNames: string[]) {
    super(message)
    this.name = 'AgentExecutionError'
    this.executedToolNames = executedToolNames
  }
}

export interface PendingConfirmation {
  toolName: string
  args: Record<string, unknown>
  preview?: unknown
  requiresExplicit: boolean
}

export interface AiPlanPreview {
  planId: string
  periodStart: string
  periodEnd: string
  availableCents: number
  allocations: Array<{ label: string; amountCents: number; type: string }>
  totalAllocated: number
  freeAfter: number
  warnings: string[]
}
