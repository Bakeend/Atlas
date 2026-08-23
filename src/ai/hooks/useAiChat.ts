import { useCallback, useMemo, useRef, useState } from 'react'
import { uid, today } from '../../domain'
import { useFinanceStore } from '../../store'
import { runAgentLoop } from '../agent/agentLoop'
import type { ChatMessage } from '../services/openRouterClient'

export interface UiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{ name:string; args:any; result:any }>
  timestamp: string
  pendingPlanId?: string
  undoId?: string
}

export function useAiChat(conversationId?: string) {
  const { aiMessages, aiConversations, addAiMessage, addAiConversation, addAiLog } = useFinanceStore() as any
  const [messages, setMessages] = useState<UiChatMessage[]>(() => {
    if (!conversationId) return []
    const stored = (aiMessages ?? []).filter((m:any)=> m.conversationId===conversationId).sort((a:any,b:any)=> a.createdAt.localeCompare(b.createdAt))
    return stored.map((m:any)=> ({ id: m.id, role: m.role as any, content: m.content, toolCalls: m.toolResults ? JSON.parse(m.content) : undefined, timestamp: m.createdAt }))
  })
  const [isStreaming, setIsStreaming] = useState(false)
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
    setError('')
    const convId = ensureConversation()
    const userMsg: UiChatMessage = { id: uid(), role: 'user', content: trimmed, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    // persist user message
    addAiMessage({ id: userMsg.id, conversationId: convId, role: 'user', content: trimmed, createdAt: userMsg.timestamp })

    setIsStreaming(true)
    setStep('Analisando suas finanças...')
    abortRef.current = new AbortController()

    try {
      const result = await runAgentLoop(trimmed, historyForModel, { signal: abortRef.current.signal, onStep: setStep })
      const assistantMsg: UiChatMessage = {
        id: uid(),
        role: 'assistant',
        content: result.content,
        toolCalls: result.toolCallsExecuted,
        timestamp: new Date().toISOString(),
      }
      // detect pending plan for preview UI
      const planCall = result.toolCallsExecuted.find(tc=> tc.name==='createAllocationPlan' && (tc.result as any)?.success)
      if (planCall) assistantMsg.pendingPlanId = (planCall.result as any)?.plan?.id

      // detect undoable transaction creation
      const txCall = result.toolCallsExecuted.find(tc=> tc.name==='createTransaction' && (tc.result as any)?.success)
      if (txCall) assistantMsg.undoId = (txCall.result as any)?.transaction?.id

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
      // also add assistant error message
      const errMsg: UiChatMessage = { id: uid(), role: 'assistant', content: 'Não foi possível acessar o assistente agora. Seus dados continuam seguros e disponíveis.', timestamp: new Date().toISOString() }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsStreaming(false)
      setStep('')
      abortRef.current = null
    }
  }, [isStreaming, historyForModel, ensureConversation, addAiMessage, addAiLog])

  const cancel = useCallback(()=> {
    abortRef.current?.abort()
    setIsStreaming(false)
    setStep('')
  }, [])

  const clear = useCallback(()=> {
    setMessages([])
    setError('')
  }, [])

  return { messages, isStreaming, step, error, send, cancel, clear, activeConversationId, setMessages }
}
