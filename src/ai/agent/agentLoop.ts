import { SYSTEM_PROMPT } from '../prompts/systemPrompt'
import { buildFinancialContext, sanitizeContextForPrompt } from '../context/financialContext'
import { requestAI, type ChatMessage } from '../services/openRouterClient'
import { executeTool } from '../tools/registry'
import { requiresConfirmation } from '../permissions/confirmationPolicy'
import { AgentExecutionError, type AgentLoopOptions, type AgentResult, type PendingConfirmation } from '../types/agentTypes'

const MAX_ITERATIONS = 8

function toOpenRouterMessages(base: ChatMessage[], userMessage: string, alreadyExecuted?: string[]): ChatMessage[] {
  const ctx = buildFinancialContext()
  const sanitized = sanitizeContextForPrompt(ctx)
  const systemMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `Contexto financeiro atual (resumo):\n${sanitized}\nData de hoje: ${ctx.today}` },
  ]
  if (alreadyExecuted?.length) {
    systemMessages.push({ role: 'system', content: `Tentativa anterior interrompida. Ferramentas já executadas com sucesso (NÃO repita): ${alreadyExecuted.join(', ')}. Continue de onde parou.` })
  }
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
  let messages: ChatMessage[] = toOpenRouterMessages(history, userMessage, opts.alreadyExecuted)
  const executed: Array<{ name:string; args:Record<string,unknown>; result:unknown }> = []
  const pendingConfirmations: PendingConfirmation[] = []
  let finalContent = ''

  try {
    for (let iter=0; iter<maxIter; iter++) {
      opts.onStep?.(iter===0 ? 'Analisando suas finanças...' : `Etapa ${iter+1}...`)
      const response = await requestAI({ messages, signal: opts.signal })
      const choice = response.choices?.[0]
      if (!choice) throw new Error('Resposta vazia do modelo')

      const toolCalls = extractToolCalls(choice)
      const content = choice.message?.content ?? choice.message?.reasoning ?? ''

      if (!toolCalls.length) {
        finalContent = content || (executed.length ? 'Concluído.' : 'Não entendi. Pode reformular?')
        return { content: finalContent, toolCallsExecuted: executed, pendingConfirmations: pendingConfirmations.length ? pendingConfirmations : undefined, usage: response.usage }
      }

      // Append assistant tool_calls message
      messages.push({
        role: 'assistant',
        content: content ?? '',
        tool_calls: toolCalls.map(tc=> ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })),
      })

      for (const tc of toolCalls) {
        // Confirmação NUNCA vem do modelo: strip e bloqueio determinístico
        const cleanArgs = { ...tc.arguments }
        delete (cleanArgs as any)._confirmed
        const level = requiresConfirmation(tc.name, cleanArgs)
        const gatedByPreviewApply = level === 'preview' && (tc.name === 'applyAllocationPlan' || tc.name === 'applyPaymentAllocationPlan')
        if (level === 'explicit' || gatedByPreviewApply) {
          const result = { success: false, requiresConfirmation: true, error: `Ação "${tc.name}" requer confirmação explícita do usuário. Apresente a ação e aguarde a confirmação na interface — não tente executar novamente.` }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
          executed.push({ name: tc.name, args: cleanArgs, result })
          pendingConfirmations.push({ toolName: tc.name, args: cleanArgs, requiresExplicit: true })
          continue
        }

        opts.onStep?.(toolLabel(tc.name))
        const exec = await executeTool(tc.name, cleanArgs)
        const payload = exec.success ? exec.result : { success: false, error: exec.error }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(payload).slice(0, 4000) })
        executed.push({ name: tc.name, args: cleanArgs, result: payload })
      }
    }
  } catch (e) {
    throw e instanceof AgentExecutionError ? e : new AgentExecutionError(e instanceof Error ? e.message : String(e), executed.map(item => item.name))
  }

  return { content: finalContent || 'Limite de etapas atingido. Tente simplificar seu pedido.', toolCallsExecuted: executed, pendingConfirmations: pendingConfirmations.length ? pendingConfirmations : undefined }
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
