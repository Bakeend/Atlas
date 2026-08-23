import { useCallback, useMemo, useRef, useState } from 'react'
import { uid, today } from '../../domain'
import { useFinanceStore } from '../../store'
import { runAgentLoop } from '../agent/agentLoop'
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
  pendingAction?: PendingAction
}

export function useAiChat(conversationId?: string) {
  const { aiMessages, aiConversations, addAiMessage, addAiConversation, addAiLog } = useFinanceStore() as any
  const [messages, setMessages] = useState<UiChatMessage[]>(() => {
    if (!conversationId) return []
    const stored = (aiMessages ?? []).filter((m:any)=> m.conversationId===conversationId).sort((a:any,b:any)=> a.createdAt.localeCompare(b.createdAt))
    return stored.map((m:any)=> ({ id: m.id, role: m.role as any, content: m.content, toolCalls: m.toolResults ? JSON.parse(m.content) : undefined, timestamp: m.createdAt }))
  })
  const [isStreaming, setIsStreaming] = useState(false)
  const [chatState, setChatState] = useState<ChatRequestState>('idle')
  const [pendingAction, setPendingAction] = useState<PendingAction | undefined>(undefined)
  const [step, setStep] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(conversationId)
  const abortRef = useRef<AbortController | null>(null)

  const ensureConversation = useCallback(() => {
    if (activeConversationId) return activeConversationId
    const id = uid()
    const conv = { id, title: 'Nova conversa', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    addAiConversation(conv)
    setActiveConversationId(id)
    return id
  }, [activeConversationId, addAiConversation])

  const historyForModel = useMemo((): ChatMessage[] => {
    // Convert Ui messages to model history (last 12 + context)
    // Keep only user/assistant content, truncate long histories
    const last = messages.slice(-12)
    const hist: ChatMessage[] = []
    for (const m of last) {
      if (m.role==='user') hist.push({ role: 'user', content: m.content })
      else hist.push({ role: 'assistant', content: m.content })
    }
    return hist
  }, [messages])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    // Se há ação pendente, "Sim"/"Cancelar" confirma/cancela (01:48-49)
    const lower = trimmed.toLowerCase()
    if (pendingAction && pendingAction.status === 'pending') {
      if (['sim', 'pode criar', 'pode', 'confirma', 'confirmar', 'aplica', 'aplicar'].includes(lower)) {
        const action = pendingAction
        setPendingAction({ ...action, status: 'confirmed' })
        setChatState('executing-action')
        // executa ação segura via tool correspondente
        try {
          const { executeTool } = await import('../tools/registry')
          const exec = await executeTool(action.type, action.payload as Record<string, unknown>)
          setPendingAction({ ...action, status: exec.success ? 'completed' : 'failed' })
          setChatState(exec.success ? 'responding' : 'error')
          const msg: UiChatMessage = {
            id: uid(),
            role: 'assistant',
            content: exec.success ? '✓ Ação concluída.' : `Não foi possível concluir: ${(exec as { error?: string }).error ?? 'erro'}`,
            presentation: exec.success
              ? { text: 'Ação concluída', blocks: [{ type: 'success', title: 'Concluído', description: 'Ação executada com sucesso.' } as unknown as AiPresentation['blocks'][number]] }
              : { text: 'Erro', blocks: [{ type: 'error', title: 'Não foi possível concluir', description: String((exec as { error?: string }).error ?? 'Tente novamente'), retryAction: { type: 'retry', label: 'Tentar novamente' } } as unknown as AiPresentation['blocks'][number]] },
            timestamp: new Date().toISOString(),
          }
          setMessages(prev => [...prev, msg])
          setChatState('idle')
          return
        } catch {
          setPendingAction({ ...action, status: 'failed' })
          setChatState('error')
          return
        }
      }
      if (['não', 'nao', 'cancela', 'cancelar', 'cancel'].includes(lower)) {
        setPendingAction({ ...pendingAction, status: 'cancelled' })
        setChatState('idle')
        const msg: UiChatMessage = { id: uid(), role: 'assistant', content: 'Ação cancelada. Nenhuma alteração foi feita.', presentation: { text: 'Cancelado', blocks: [{ type: 'success', title: 'Cancelado', description: 'Nenhuma alteração foi feita.' } as unknown as AiPresentation['blocks'][number]] }, timestamp: new Date().toISOString() }
        setMessages(prev => [...prev, msg])
        return
      }
    }

    setError('')
    const convId = ensureConversation()
    const userMsg: UiChatMessage = { id: uid(), role: 'user', content: trimmed, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    // persist user message
    addAiMessage({ id: userMsg.id, conversationId: convId, role: 'user', content: trimmed, createdAt: userMsg.timestamp })

    setIsStreaming(true)
    setChatState('processing')
    setStep('Analisando suas finanças...')
    abortRef.current = new AbortController()

    try {
      const result = await runAgentLoop(trimmed, historyForModel, { signal: abortRef.current.signal, onStep: (s) => { setStep(s); setChatState('processing') } })
      const presentation = buildPresentationFromTools(result.content, result.toolCallsExecuted)
      const assistantMsg: UiChatMessage = {
        id: uid(),
        role: 'assistant',
        content: result.content,
        toolCalls: result.toolCallsExecuted,
        presentation,
        timestamp: new Date().toISOString(),
      }
      // detect pending plan for preview UI (both allocation types)
      const planCall = result.toolCallsExecuted.find(tc=> (tc.name==='createAllocationPlan' || tc.name==='preparePaymentAllocationPlan') && (tc.result as any)?.success)
      if (planCall) {
        const planId = (planCall.result as any)?.plan?.id ?? (planCall.result as any)?.plan?.id
        if (planId) assistantMsg.pendingPlanId = planId
      }
      // also catch paymentAllocation plan id from result.plans or plan
      const paymentPlanCall = result.toolCallsExecuted.find(tc=> tc.name==='preparePaymentAllocationPlan' && (tc.result as any)?.success)
      if (paymentPlanCall && !assistantMsg.pendingPlanId) {
        const pid = (paymentPlanCall.result as any)?.plan?.id
        if (pid) assistantMsg.pendingPlanId = pid
      }

      // detect undoable transaction creation
      const txCall = result.toolCallsExecuted.find(tc=> tc.name==='createTransaction' && (tc.result as any)?.success)
      if (txCall) assistantMsg.undoId = (txCall.result as any)?.transaction?.id
      // also detect income that could be organized
      const incomeTx = result.toolCallsExecuted.find(tc=> tc.name==='createTransaction' && (tc.result as any)?.transaction?.type==='income')
      if (incomeTx) {
        // hint that user can organize payment — not auto-executed
        assistantMsg.pendingPlanId = assistantMsg.pendingPlanId // keep existing
      }

      // Detecta confirmação pendente para próximo "Sim" (01:49)
      const confirmationBlock = presentation.blocks.find(b => b.type === 'confirmation' || b.type === 'entity-preview')
      if (confirmationBlock) {
        const pending: PendingAction = {
          id: uid(),
          type: (confirmationBlock as { confirmAction?: { type: string } }).confirmAction?.type as PendingAction['type'] ?? 'create-category',
          payload: (confirmationBlock as { confirmAction?: { payload: unknown } }).confirmAction?.payload ?? {},
          confirmationRequired: true,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
        assistantMsg.pendingAction = pending
        setPendingAction(pending)
        setChatState('awaiting-confirmation')
      } else {
        setChatState('responding')
      }

      setMessages(prev => [...prev, assistantMsg])
      addAiMessage({ id: assistantMsg.id, conversationId: convId, role: 'assistant', content: result.content + (result.toolCallsExecuted.length ? `\n\n[TOOLS:${JSON.stringify(result.toolCallsExecuted).slice(0,2000)}]` : ''), createdAt: assistantMsg.timestamp } as any)

      // logs
      for (const tc of result.toolCallsExecuted) {
        try { addAiLog({ id: uid(), timestamp: new Date().toISOString(), conversationId: convId, action: tc.name, entityType: tc.name, entityId: (tc.result as any)?.transaction?.id ?? (tc.result as any)?.plan?.id ?? tc.name, status: (tc.result as any)?.success ? 'success' : 'failed', requiresConfirmation: false, detail: JSON.stringify(tc.args).slice(0,300) }) } catch {}
      }

    } catch (e:any) {
      const msg = e?.message ?? String(e)
      if (msg.includes('NOT_CONFIGURED') || msg.includes('não configurado')) {
        setError('Assistente não configurado.')
      } else if (msg.includes('RATE_LIMIT') || msg.includes('429')) {
        setError('Muitas solicitações agora. Tente novamente em instantes.')
      } else if (msg.includes('Timeout') || msg.includes('Abort')) {
        setError('Não foi possível acessar o assistente agora. Seus dados continuam seguros e disponíveis.')
      } else {
        setError(msg.slice(0,280) || 'Erro ao contatar assistente.')
      }
      setChatState('error')
      // also add assistant error message (01:65)
      const errMsg: UiChatMessage = {
        id: uid(),
        role: 'assistant',
        content: 'Não foi possível acessar o assistente agora. Seus dados continuam seguros e disponíveis.',
        presentation: { text: 'Erro', blocks: [{ type: 'error', title: 'Não consegui consultar a assistente', description: 'Seus dados continuam disponíveis normalmente.', retryAction: { type: 'retry', label: 'Tentar novamente' } } as unknown as AiPresentation['blocks'][number]] },
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsStreaming(false)
      setChatState(prev => prev === 'responding' ? 'idle' : prev === 'error' ? 'error' : 'idle')
      setStep('')
      abortRef.current = null
    }
  }, [isStreaming, historyForModel, ensureConversation, addAiMessage, addAiLog, pendingAction])

  const cancel = useCallback(()=> {
    abortRef.current?.abort()
    setIsStreaming(false)
    setChatState('idle')
    setStep('')
  }, [])

  const clear = useCallback(()=> {
    setMessages([])
    setError('')
    setChatState('idle')
    setPendingAction(undefined)
  }, [])

  return { messages, isStreaming, chatState, pendingAction, step, error, send, cancel, clear, activeConversationId, setMessages, setChatState }
}
