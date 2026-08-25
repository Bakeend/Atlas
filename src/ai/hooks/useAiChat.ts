import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { uid } from '../../domain'
import { useFinanceStore } from '../../store'
import { runAgentLoop } from '../agent/agentLoop'
import { executeTool } from '../tools/registry'
import type { ChatMessage } from '../services/openRouterClient'
import type { AiPresentation, ChatRequestState, PendingAction } from '../visual/types'
import { buildPresentationFromTools } from '../visual/buildPresentation'

export interface UiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{ name:string; args:any; result:any }>
  presentation?: AiPresentation
  timestamp: string
  pendingPlanId?: string
  undoId?: string
  undone?: boolean
  pendingAction?: PendingAction
}

function describePending(action: PendingAction): string {
  const args = (action.payload ?? {}) as Record<string, unknown>
  switch (action.type) {
    case 'deleteTransaction': return 'Excluir esta transação? Esta ação pode ser revertida pelo botão Desfazer.'
    case 'deleteCategory': return `Excluir a categoria "${String(args.name ?? '')}"?`
    case 'deleteRecurringExpense': return `Excluir o gasto recorrente vinculado?`
    case 'deleteRecurringIncome': return 'Excluir esta receita recorrente?'
    case 'deleteBudget': return 'Excluir este orçamento?'
    case 'deleteGoal': return 'Excluir esta meta?'
    case 'deleteAccount': return 'Excluir/arquivar esta conta?'
    case 'deleteAllocationPlan': return 'Excluir este plano de organização?'
    case 'applyAllocationPlan': return 'Aplicar este plano de organização do dinheiro?'
    case 'applyPaymentAllocationPlan': return 'Aplicar este plano de pagamento?'
    case 'cancelPaymentAllocationPlan': return 'Cancelar este plano de pagamento?'
    default: return `Confirmar execução de ${action.type}?`
  }
}

export function useAiChat(conversationId?: string) {
  const { aiMessages, aiConversations, addAiMessage, addAiConversation, addAiLog } = useFinanceStore() as any
  const [messages, setMessages] = useState<UiChatMessage[]>(() => {
    if (!conversationId) return []
    const stored = (aiMessages ?? []).filter((m:any)=> m.conversationId===conversationId).sort((a:any,b:any)=> a.createdAt.localeCompare(b.createdAt))
    // remove sufixo técnico legado gravado no content de versões antigas
    const cleanLegacy = (content:string)=> content.replace(/\n*\[TOOLS:[\s\S]*\]$/, '')
    return stored.map((m:any)=> ({ id: m.id, role: m.role as any, content: cleanLegacy(m.content), timestamp: m.createdAt, presentation: (m as any).presentation, toolCalls: (m as any).toolCalls }))
  })
  const [isStreaming, setIsStreaming] = useState(false)
  const [chatState, setChatState] = useState<ChatRequestState>('idle')
  const [pendingAction, setPendingAction] = useState<PendingAction | undefined>(undefined)
  const [step, setStep] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(conversationId)
  const abortRef = useRef<AbortController | null>(null)
  const retryRef = useRef<{ text: string; executed: string[] } | null>(null)

  // Sincroniza quando o usuário troca de conversa no histórico (não interfere na criação interna via ensureConversation)
  useEffect(() => {
    if (!conversationId) return
    if (conversationId === activeConversationId) return
    setActiveConversationId(conversationId)
    const stored = (useFinanceStore.getState() as any).aiMessages?.filter((m:any)=> m.conversationId===conversationId).sort((a:any,b:any)=> a.createdAt.localeCompare(b.createdAt)) ?? []
    const cleanLegacy = (content:string)=> content.replace(/\n*\[TOOLS:[\s\S]*\]$/, '')
    setMessages(stored.map((m:any)=> ({ id: m.id, role: m.role as any, content: cleanLegacy(m.content), timestamp: m.createdAt, presentation: (m as any).presentation, toolCalls: (m as any).toolCalls })) as UiChatMessage[])
    setPendingAction(undefined)
    setError('')
    setChatState('idle')
  }, [conversationId, activeConversationId])

  const ensureConversation = useCallback(() => {
    if (activeConversationId) return activeConversationId
    const id = uid()
    const conv = { id, title: 'Nova conversa', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    addAiConversation(conv)
    setActiveConversationId(id)
    return id
  }, [activeConversationId, addAiConversation])

  const pushLocalMessage = useCallback((content: string, extra?: Partial<UiChatMessage>) => {
    const msg: UiChatMessage = { id: uid(), role: 'assistant', content, timestamp: new Date().toISOString(), ...extra }
    setMessages(prev => [...prev, msg])
    if (activeConversationId) {
      addAiMessage({ id: msg.id, conversationId: activeConversationId, role: 'assistant', content, createdAt: msg.timestamp })
    }
    return msg
  }, [activeConversationId, addAiMessage])

  const historyForModel = useMemo((): ChatMessage[] => {
    const last = messages.slice(-12)
    const hist: ChatMessage[] = []
    for (const m of last) {
      if (m.role==='user') hist.push({ role: 'user', content: m.content })
      else {
        // preserva para o modelo o que já foi executado — evita reconsultar dados
        let content = m.content
        if (m.toolCalls?.length) {
          const summary = m.toolCalls
            .map(tc => `${tc.name}(${JSON.stringify(tc.args ?? {}).slice(0, 60)})→${(tc.result as any)?.success === false ? 'falha' : 'ok'}`)
            .join('; ').slice(0, 300)
          content += `\n[Ferramentas executadas nesta resposta: ${summary}]`
        }
        hist.push({ role: 'assistant', content })
      }
    }
    return hist
  }, [messages])

  // Executa ação pendente APÓS toque humano em Confirmar — 0 chamadas de IA
  const confirmPending = useCallback(async () => {
    const action = pendingAction
    if (!action || action.status !== 'pending') return
    setPendingAction({ ...action, status: 'confirmed' })
    setChatState('executing-action')
    try {
      const exec = await executeTool(action.type, (action.payload ?? {}) as Record<string, unknown>, { confirmed: true })
      setPendingAction({ ...action, status: exec.success ? 'completed' : 'failed' })
      setMessages(prev => prev.map(m => m.pendingAction?.id === action.id ? { ...m, pendingAction: { ...action, status: exec.success ? 'completed' : 'failed' } } : m))
      pushLocalMessage(exec.success ? '✓ Ação concluída.' : `Não foi possível concluir: ${exec.error ?? 'erro desconhecido.'}`)
      setChatState('idle')
    } catch {
      setPendingAction({ ...action, status: 'failed' })
      setChatState('idle')
      pushLocalMessage('Não foi possível concluir a ação.')
    }
  }, [pendingAction, pushLocalMessage])

  const cancelPending = useCallback(() => {
    const action = pendingAction
    if (!action || action.status !== 'pending') return
    setPendingAction({ ...action, status: 'cancelled' })
    setMessages(prev => prev.map(m => m.pendingAction?.id === action.id ? { ...m, pendingAction: { ...action, status: 'cancelled' } } : m))
    pushLocalMessage('Ação cancelada. Nenhuma alteração foi feita.')
    setChatState('idle')
  }, [pendingAction, pushLocalMessage])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    if (pendingAction && pendingAction.status === 'pending') {
      const lower = trimmed.toLowerCase()
      if (['sim', 'pode criar', 'pode', 'confirma', 'confirmar', 'aplica', 'aplicar'].includes(lower)) { await confirmPending(); return }
      if (['não', 'nao', 'cancela', 'cancelar', 'cancel'].includes(lower)) { cancelPending(); return }
      // nova mensagem com intenção diferente → libera pendência anterior para não travar o fluxo
      setPendingAction(undefined)
      setMessages(prev => prev.map(m => m.pendingAction?.status === 'pending' ? { ...m, pendingAction: { ...m.pendingAction!, status: 'cancelled' as const } } : m))
    }

    setError('')
    const convId = ensureConversation()
    const userMsg: UiChatMessage = { id: uid(), role: 'user', content: trimmed, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    addAiMessage({ id: userMsg.id, conversationId: convId, role: 'user', content: trimmed, createdAt: userMsg.timestamp })

    setIsStreaming(true)
    setChatState('processing')
    setStep('Analisando suas finanças...')
    abortRef.current = new AbortController()

    try {
      const continuation = retryRef.current && retryRef.current.text === trimmed ? retryRef.current : null
      retryRef.current = null
      const result = await runAgentLoop(trimmed, historyForModel, {
        signal: abortRef.current.signal,
        alreadyExecuted: continuation?.executed,
        onStep: (s) => { setStep(s); setChatState('processing') },
      })
      const presentation = buildPresentationFromTools(result.content, result.toolCallsExecuted)
      const assistantMsg: UiChatMessage = {
        id: uid(),
        role: 'assistant',
        content: result.content,
        toolCalls: result.toolCallsExecuted,
        presentation,
        timestamp: new Date().toISOString(),
      }

      const planCall = result.toolCallsExecuted.find(tc=> (tc.name==='createAllocationPlan' || tc.name==='preparePaymentAllocationPlan') && (tc.result as any)?.success)
      if (planCall) {
        const planId = (planCall.result as any)?.plan?.id
        if (planId) assistantMsg.pendingPlanId = planId
      }

      const txCall = result.toolCallsExecuted.find(tc=> tc.name==='createTransaction' && (tc.result as any)?.success)
      if (txCall) assistantMsg.undoId = (txCall.result as any)?.transaction?.id

      // Confirmação pendente vem do LOOP (determinístico), nunca do texto do modelo
      const pendingConfirmation = result.pendingConfirmations?.[0]
      if (pendingConfirmation) {
        const pending: PendingAction = {
          id: uid(),
          type: pendingConfirmation.toolName,
          payload: pendingConfirmation.args,
          confirmationRequired: true,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
        assistantMsg.pendingAction = pending
        assistantMsg.pendingPlanId = undefined
        setPendingAction(pending)
        setChatState('awaiting-confirmation')
      } else {
        // limpa confirmação anterior quando nova resposta não exige clique
        setPendingAction(undefined)
        setChatState('responding')
      }

      setMessages(prev => [...prev, assistantMsg])
      addAiMessage({ id: assistantMsg.id, conversationId: convId, role: 'assistant', content: result.content, createdAt: assistantMsg.timestamp } as any)

      for (const tc of result.toolCallsExecuted) {
        addAiLog({ id: uid(), timestamp: new Date().toISOString(), conversationId: convId, action: tc.name, entityType: tc.name, entityId: (tc.result as any)?.transaction?.id ?? (tc.result as any)?.plan?.id ?? tc.name, status: (tc.result as any)?.success ? 'success' : 'failed', requiresConfirmation: Boolean((tc.result as any)?.requiresConfirmation), detail: JSON.stringify(tc.args).slice(0,300) })
      }
    } catch (e:any) {
      const executedNames: string[] = e?.executedToolNames ?? []
      if (executedNames.length && trimmed) retryRef.current = { text: trimmed, executed: executedNames }
      const msg = e?.message ?? String(e)
      let baseError = ''
      if (msg.includes('NOT_CONFIGURED') || msg.includes('não configurado')) {
        baseError = 'Assistente não configurado.'
      } else if (msg.includes('RATE_LIMIT') || msg.includes('429')) {
        baseError = 'Muitas solicitações agora. Tente novamente em instantes.'
      } else if (msg.includes('Timeout') || msg.includes('Abort')) {
        baseError = 'Não foi possível acessar o assistente agora. Seus dados continuam seguros e disponíveis.'
      } else {
        baseError = msg.slice(0,280) || 'Erro ao contatar assistente.'
      }
      if (executedNames.length) {
        setError(`Não foi possível concluir tudo agora. As etapas já executadas foram preservadas e não serão repetidas. ${baseError}`)
      } else {
        setError(baseError)
      }
      setChatState('error')
    } finally {
      setIsStreaming(false)
      setChatState(prev => prev === 'responding' ? 'idle' : prev === 'error' ? 'error' : 'idle')
      setStep('')
      abortRef.current = null
    }
  }, [isStreaming, historyForModel, ensureConversation, addAiMessage, addAiLog, pendingAction, confirmPending, cancelPending])

  const retryLastFailure = useCallback(async () => {
    const failure = retryRef.current
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    const text = failure?.text ?? lastUser?.content
    if (!text || isStreaming) return
    setError('')
    await send(text)
  }, [messages, isStreaming, send])

  const undoTransaction = useCallback((messageId: string, txId: string) => {
    const ok = useFinanceStore.getState().restoreTransaction(txId)
    if (ok) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, undone: true } : m))
      pushLocalMessage('✓ Transação restaurada. Ela voltou a contar no saldo e nos relatórios.')
    } else {
      pushLocalMessage('Esta transação não pôde ser restaurada — talvez já esteja ativa.')
    }
  }, [pushLocalMessage])

  const cancel = useCallback(()=> {
    abortRef.current?.abort()
    setIsStreaming(false)
    setChatState('idle')
    setStep('')
    setError('')
  }, [])

  const clear = useCallback(()=> {
    setMessages([])
    setError('')
    setChatState('idle')
    setPendingAction(undefined)
  }, [])

  return { messages, isStreaming, chatState, pendingAction, step, error, send, cancel, clear, confirmPending, cancelPending, pushLocalMessage, undoTransaction, retryLastFailure, describePending, activeConversationId, setMessages, setChatState }
}
