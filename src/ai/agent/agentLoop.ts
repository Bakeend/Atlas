import { SYSTEM_PROMPT } from '../prompts/systemPrompt'
import { buildFinancialContext, sanitizeContextForPrompt } from '../context/financialContext'
import { requestAI, type ChatMessage } from '../services/openRouterClient'
import { executeTool } from '../tools/registry'
import { requiresConfirmation } from '../permissions/confirmationPolicy'
import type { AgentLoopOptions, AgentResult } from '../types/agentTypes'

const MAX_ITERATIONS = 8

function toOpenRouterMessages(base: ChatMessage[], userMessage: string): ChatMessage[] {
  const ctx = buildFinancialContext()
  const sanitized = sanitizeContextForPrompt(ctx)
  const systemMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `Contexto financeiro atual (resumo):\n${sanitized}\nData de hoje: ${ctx.today}` },
  ]
  return [...systemMessages, ...base, { role: 'user', content: userMessage }]
}

// Helper to parse tool_calls from assistant message (OpenRouter format)
function extractToolCalls(choice: any): Array<{ id:string; name:string; arguments: Record<string,unknown> }> {
  const msg = choice?.message ?? choice?.delta ?? {}
  const calls = msg.tool_calls ?? msg.toolCalls ?? []
  return calls.map((c:any)=> {
    const fn = c.function ?? c
    let args: Record<string,unknown> = {}
    try { args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : (fn.arguments ?? {}) } catch { args = {} }
    return { id: c.id ?? fn.id ?? `call_${Math.random()}`, name: fn.name, arguments: args }
  })
}

export async function runAgentLoop(userMessage: string, history: ChatMessage[], opts: AgentLoopOptions = {}): Promise<AgentResult> {
  const maxIter = opts.maxIterations ?? MAX_ITERATIONS
  let messages: ChatMessage[] = toOpenRouterMessages(history, userMessage)
  const executed: Array<{ name:string; args:Record<string,unknown>; result:unknown }> = []
  let finalContent = ''

  for (let iter=0; iter<maxIter; iter++) {
    opts.onStep?.(iter===0 ? 'Analisando suas finanças...' : `Etapa ${iter+1}...`)
    const response = await requestAI({ messages, signal: opts.signal })
    const choice = response.choices?.[0]
    if (!choice) throw new Error('Resposta vazia do modelo')

    const toolCalls = extractToolCalls(choice)
    const content = choice.message?.content ?? choice.message?.reasoning ?? ''

    if (!toolCalls.length) {
      finalContent = content || (executed.length ? 'Concluído.' : 'Não entendi. Pode reformular?')
      // push final assistant to history? caller does
      return { content: finalContent, toolCallsExecuted: executed, usage: response.usage }
    }

    // If tool calls require confirmation, we don't execute destructive immediately — return pending
    // For now, handle confirmation via flag inside args? Spec: destructive requires explicit — we assume UI already validated.
    // Here we still execute but track requiresConfirmation for logs.
    // If multiple tool calls, execute sequentially respecting dependencies (don't parallelize dependent ones)
    // Spec says: independent queries can be parallel — we do sequential for safety (still correct)

    // Append assistant tool_calls message
    messages.push({
      role: 'assistant',
      content: content ?? '',
      tool_calls: toolCalls.map(tc=> ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })),
    })

    for (const tc of toolCalls) {
      const level = requiresConfirmation(tc.name, tc.arguments)
      // For explicit, we would expect frontend to have asked; if still pending, we return error to model
      // For preview, same — model should have been instructed to preview
      // We still execute but include warning in result if needed? For destructive, we enforce check via store? We just execute; UI layer can intercept.
      // To enforce, if destructive and not explicitly confirmed, we block:
      // We check if tool is destructive and history doesn't contain explicit confirmation — simplistic: block if level==='explicit' and not already confirmed flag
      // For now, we add a hook: if level==='explicit' and opts.conversationId doesn't have confirmation, we return error result
      // Since spec says "sempre exigir confirmação explícita", we should not auto-execute delete without UI confirmation.
      // So if caller hasn't passed confirmed flag, we simulate block.
      // We'll allow a special arg _confirmed to bypass — frontend sets when user confirms
      const isConfirmed = (tc.arguments as any)?._confirmed === true
      if (level==='explicit' && !isConfirmed) {
        const result = { success: false, error: `Ação destrutiva "${tc.name}" requer confirmação explícita. Peça confirmação ao usuário antes de executar.` }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
        executed.push({ name: tc.name, args: tc.arguments, result })
        continue
      }
      if (level==='preview' && !isConfirmed) {
        // For preview tools, first call creates draft and needs user to apply. We still execute create but apply needs confirmation.
        // createAllocationPlan and preparePaymentAllocationPlan are drafts, okay to execute without confirm, but apply needs confirm.
        // So only block applyAllocationPlan / applyPaymentAllocationPlan
        if (tc.name==='applyAllocationPlan' || tc.name==='applyPaymentAllocationPlan') {
          const result = { success: false, error: 'Preview necessário: apresente o plano ao usuário e peça [Aplicar] antes de executar ' + tc.name + '.' }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
          executed.push({ name: tc.name, args: tc.arguments, result })
          continue
        }
        // preparePaymentAllocationPlan is allowed without confirmation (it creates draft+preview), so continue to execution
      }

      opts.onStep?.(toolLabel(tc.name))
      const exec = await executeTool(tc.name, tc.arguments)
      const payload = exec.success ? exec.result : { success: false, error: exec.error }
      // push tool result
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(payload).slice(0, 4000) })
      executed.push({ name: tc.name, args: tc.arguments, result: payload })
    }
  }

  return { content: finalContent || 'Limite de etapas atingido. Tente simplificar seu pedido.', toolCallsExecuted: executed }
}

function toolLabel(name: string): string {
  const map: Record<string,string> = {
    getTransactions: 'Consultando transações...',
    getTransactionsByPeriod: 'Consultando período...',
    getTransactionsByCategory: 'Analisando categoria...',
    getFinancialSummary: 'Analisando suas finanças...',
    getAccounts: 'Consultando contas...',
    getAccountBalances: 'Verificando saldos...',
    getCategories: 'Buscando categorias...',
    getRecurringExpenses: 'Consultando recorrências...',
    getBudgetStatus: 'Analisando orçamentos...',
    getCashFlowForecast: 'Calculando previsão...',
    getAvailableMoney: 'Calculando disponível...',
    getFreeMoney: 'Calculando dinheiro livre...',
    getFreeMoneyBreakdown: 'Detalhando dinheiro livre...',
    getCommittedAmount: 'Calculando comprometido...',
    getSpendingAnalysis: 'Analisando gastos...',
    getSpendingAnomalies: 'Detectando variações...',
    createTransaction: 'Registrando movimentação...',
    createRecurringExpense: 'Criando gasto recorrente...',
    createRecurringIncome: 'Criando receita recorrente...',
    createCategory: 'Organizando categorias...',
    createAllocationPlan: 'Preparando organização...',
    applyAllocationPlan: 'Aplicando organização...',
    preparePaymentAllocationPlan: 'Organizando seu pagamento...',
    getPaymentAllocationPlan: 'Buscando plano...',
    applyPaymentAllocationPlan: 'Aplicando organização...',
    cancelPaymentAllocationPlan: 'Cancelando plano...',
    updatePaymentAllocationItem: 'Ajustando plano...',
    getSafeDailySpend: 'Calculando limite diário...',
    simulateDailySpend: 'Simulando gasto...',
  }
  return map[name] ?? `Executando ${name}...`
}
