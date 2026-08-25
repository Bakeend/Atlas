import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, History, Loader2, Plus, Send, Sparkles, Trash2, Wallet, Target, ReceiptText, Repeat2, ChartPie, Volume2, VolumeX } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../components'
import { uid } from '../../domain'
import { useFinanceStore } from '../../store'
import { useAiChat } from '../hooks/useAiChat'
import { ToolResultRenderer } from './AiCards'
import { AiVisualRenderer } from '../visual/AiVisualRenderer'
import { ChatVoiceButton } from './ChatVoiceButton'
import { executeTool } from '../tools/registry'
import { WebSpeechSynthesisAdapter, NoopTextToSpeechService } from '../voice/WebSpeechSynthesisAdapter'
import type { TextToSpeechService } from '../voice/TextToSpeechService'

const suggestions = [
  { icon: Wallet, label: 'Organizar pagamento', prompt: 'Recebi R$ 4.500. Organiza meu pagamento até o próximo recebimento.' },
  { icon: Wallet, label: 'Organizar meu dinheiro', prompt: 'Organiza meu dinheiro até o próximo salário.' },
  { icon: ChartPie, label: 'Analisar meus gastos', prompt: 'Onde estou gastando mais nos últimos 3 meses? Analise por categoria.' },
  { icon: ReceiptText, label: 'Registrar uma despesa', prompt: 'Gastei R$ 50 no mercado hoje.' },
  { icon: Repeat2, label: 'Criar gasto recorrente', prompt: 'Todo dia 10 pago R$ 120 de internet.' },
  { icon: Target, label: 'Criar uma meta', prompt: 'Quero guardar R$ 500 por mês. Cria uma meta chamada Reserva mensal.' },
]

function RichContent({ text, onAction }: { text: string; onAction?: (label: string) => void }) {
  // Renderiza **negrito** e [ação] como botão sem dangerouslySetInnerHTML (AGENTS 9)
  const parts = text.split(/(\*\*[^*]+?\*\*|\[[^\]]+\])/g)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('[') && part.endsWith(']') && part.length >= 3) {
          const label = part.slice(1, -1).trim()
          if (!label) return <span key={i}>{part}</span>
          return (
            <button
              key={i}
              onClick={() => onAction?.(label)}
              className="mx-1 inline-flex items-center rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {label}
            </button>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
// compat
const BoldContent = RichContent

export function AiAssistantPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { aiConversations, deleteAiConversation } = useFinanceStore() as any
  const [convId, setConvId] = useState<string | undefined>(undefined)
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const {
    messages, isStreaming, chatState, step, error, send, cancel,
    confirmPending, cancelPending, pushLocalMessage, undoTransaction, retryLastFailure, describePending,
    pendingAction,
  } = useAiChat(convId) as ReturnType<typeof useAiChat> & { pendingAction?: any }
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ttsRef = useRef<TextToSpeechService | null>(null)
  const [isTtsEnabled, setIsTtsEnabled] = useState(true)
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle')
  const pendingConfirmation = (pendingAction as any)?.status === 'pending' ? (pendingAction as any) : undefined
  const qSentRef = useRef<string | null>(null)

  useEffect(()=> { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, isStreaming, step])

  // HomeInput → /assistant?q= : pré-preenche e envia (guard contra StrictMode e navegação dupla)
  useEffect(() => {
    const q = searchParams.get('q')
    if (!q || !q.trim()) {
      if (qSentRef.current) qSentRef.current = null
      return
    }
    if (qSentRef.current === q) return
    if (isStreaming) return
    qSentRef.current = q
    setInput('')
    void send(q.trim())
    setSearchParams({}, { replace: true })
  }, [searchParams, isStreaming, send, setSearchParams])

  // TTS: fala respostas curtas em paralelo à exibição
  useEffect(() => {
    if (!isTtsEnabled) return
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && last.presentation?.speech) {
      if (!ttsRef.current) {
        const adapter = new WebSpeechSynthesisAdapter()
        ttsRef.current = adapter.isSupported() ? adapter : new NoopTextToSpeechService()
      }
      void ttsRef.current.speak(last.presentation.speech)
    }
  }, [messages, isTtsEnabled])

  const handleVoiceTranscript = (text: string) => {
    ttsRef.current?.stop()
    void send(text)
  }

  const handleSend = async (text?: string) => {
    const t = (text ?? input).trim()
    if (!t) return
    setInput('')
    await send(t)
  }

  // Aplicar plano: ação direta do usuário no botão — confirmação humana já ocorreu (0 chamadas de IA)
  const handleApplyPlan = async (planId:string) => {
    let res = await executeTool('applyPaymentAllocationPlan', { id: planId }, { confirmed: true })
    if (!(res as any).success && (res as any).error?.includes('não encontrada')) {
      res = await executeTool('applyAllocationPlan', { id: planId }, { confirmed: true })
    }
    if ((res as any).success) {
      pushLocalMessage(`✓ ${(res as any).result?.message ?? 'Plano aplicado com sucesso.'}`)
    } else {
      pushLocalMessage(`Não foi possível aplicar o plano: ${(res as any).error ?? 'erro desconhecido.'}`)
    }
  }

  const handleCancelPlan = async (planId?:string) => {
    if (!planId) return
    const res = await executeTool('cancelPaymentAllocationPlan', { id: planId }, { confirmed: true })
    if ((res as any).success) pushLocalMessage('Plano cancelado.')
    else pushLocalMessage(`Não foi possível cancelar o plano: ${(res as any).error ?? 'erro desconhecido.'}`)
  }

  return (
    <div className="ai-page">
      <div className="ai-header">
        <button onClick={()=> navigate('/')} className="ai-back" aria-label="Voltar"><ChevronLeft size={20}/></button>
        <div className="ai-header-title">
          <h1><Sparkles size={18} className="text-brand"/> Assistente financeiro</h1>
          <p>Organize e entenda suas finanças.</p>
        </div>
        <div className="ai-header-actions">
          <button className="icon-button" onClick={()=> setShowHistory(v=>!v)} aria-label="Histórico"><History size={20}/></button>
          <button className="icon-button" onClick={()=> { setConvId(undefined); location.reload() }} aria-label="Nova conversa"><Plus size={20}/></button>
        </div>
      </div>

      {showHistory && (
        <Card className="ai-history">
          <div className="ai-history-head"><strong>Histórico</strong><button className="text-xs font-semibold text-brand" onClick={()=> setShowHistory(false)}>Fechar</button></div>
          <div className="ai-history-list">
            {(aiConversations ?? []).length ? (aiConversations as any[]).slice().sort((a,b)=> b.updatedAt.localeCompare(a.updatedAt)).map(c=> (
              <div key={c.id} className={`ai-history-item ${convId===c.id?'active':''}`}>
                <button className="ai-history-select" onClick={()=> { setConvId(c.id); setShowHistory(false) }}>
                  <strong>{c.title}</strong><small>{new Date(c.updatedAt).toLocaleString('pt-BR')}</small>
                </button>
                <button className="ai-history-delete" onClick={()=> deleteAiConversation(c.id)} aria-label="Excluir conversa"><Trash2 size={14}/></button>
              </div>
            )) : <p className="empty-inline !py-4">Nenhuma conversa ainda.</p>}
          </div>
          <button className="btn-secondary w-full mt-3" onClick={()=> { const id=uid(); (useFinanceStore.getState() as any).addAiConversation({ id, title:'Nova conversa', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }); setConvId(id); setShowHistory(false) }}><Plus size={16}/> Nova conversa</button>
        </Card>
      )}

      {!messages.length && !isStreaming ? (
        <div className="ai-empty">
          <div className="ai-empty-icon"><Sparkles size={28} className="text-brand"/></div>
          <h2>Como posso ajudar?</h2>
          <p>Controle seu dinheiro com linguagem natural.</p>
          <div className="ai-suggestions">
            {suggestions.map(s=> (
              <button key={s.label} className="ai-suggestion" onClick={()=> handleSend(s.prompt)}>
                <s.icon size={18} className="text-brand"/> <span>{s.label}</span>
              </button>
            ))}
          </div>
          <Card className="ai-tip">
            <p className="text-xs leading-5 text-muted">Exemplos: <em>"Gastei 89,90 de gasolina hoje"</em>, <em>"Cria categoria Pets"</em>, <em>"Quanto posso gastar até dia 20?"</em></p>
          </Card>
        </div>
      ) : (
        <div ref={listRef} className="ai-messages">
      {messages.map(m=> (
            <div key={m.id} className={`ai-msg ${m.role}`}>
              <div className={`ai-bubble ${m.role}`}>
                <div className="ai-bubble-content"><RichContent text={m.content} onAction={(label)=> void handleSend(label)} /></div>
                {m.role === 'assistant' && m.presentation?.blocks?.length ? (
                  <div className="ai-visual-in-chat">
                    <AiVisualRenderer
                      blocks={m.presentation.blocks}
                      actions={m.presentation.actions}
                      onAction={async (action) => {
                        // ações seguras — enum restrita, nunca HTML arbitrário
                        if (action.type === 'retry') {
                          void retryLastFailure()
                        } else if (action.type === 'cancel') {
                          cancelPending()
                        } else if (action.type === 'open-transactions') {
                          navigate('/transactions')
                        } else if (action.type === 'open-category') {
                          navigate('/planning')
                        } else if (action.type === 'open-recurring') {
                          navigate('/recurring')
                        } else {
                          void send(action.label)
                        }
                      }}
                    />
                  </div>
                ) : null}
                {m.toolCalls?.length && !m.presentation?.blocks?.length ? (
                  <div className="ai-tool-cards">
                    {m.toolCalls.map((tc:any,i:number)=> (
                      <ToolResultRenderer key={i} name={tc.name} result={tc.result} onApplyPlan={handleApplyPlan} onCancelPlan={handleCancelPlan}/>
                    ))}
                  </div>
                ) : null}
                {m.undoId && !m.undone && <button className="ai-undo" onClick={()=> undoTransaction(m.id, m.undoId!)}>Desfazer</button>}
                <span className="ai-time">{new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</span>
              </div>
            </div>
          ))}
          {isStreaming && (
            <div className="ai-msg assistant">
              <div className="ai-bubble assistant streaming" role="status" aria-live="polite" aria-label={step || 'Processando'}>
                <Loader2 size={16} className="animate-spin text-brand"/> <span>{step || (chatState === 'transcribing' ? 'Ouvindo...' : chatState === 'awaiting-confirmation' ? 'Aguardando confirmação...' : chatState === 'executing-action' ? 'Executando ação...' : 'Analisando...')}</span>
                {voiceState === 'listening' && <span className="ai-voice-hint">Ouvindo...</span>}
              </div>
            </div>
          )}
          {error && !messages[messages.length - 1]?.presentation?.blocks?.some(b => (b as any).type === 'error') && (
            <div className="ai-error-banner" role="alert">
              <p>{error}</p>
              <div className="ai-error-actions">
                <button className="btn-secondary" onClick={()=> retryLastFailure()}>Tentar novamente</button>
                <button className="text-xs font-semibold text-muted" onClick={()=> cancel()}>Cancelar</button>
                <button className="text-xs font-semibold text-brand" onClick={()=> navigate('/')}>Usar aplicativo</button>
              </div>
              {!error.includes('seguros') && !error.includes('disponíveis') && <small>Seus dados continuam seguros e disponíveis.</small>}
            </div>
          )}
        </div>
      )}

      {pendingConfirmation && (
        <div className="ai-confirm-card" role="alertdialog" aria-modal="false" aria-label="Confirmação pendente">
          <p className="text-sm font-semibold">{describePending(pendingConfirmation)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={()=> cancelPending()}>Cancelar</button>
            <button className="btn-primary" onClick={()=> confirmPending()}>Confirmar</button>
          </div>
        </div>
      )}

      <div className="ai-input-bar">
        <div className="ai-input-wrap">
          <input
            ref={inputRef}
            value={input}
            onChange={e=> setInput(e.target.value)}
            onKeyDown={e=> { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Pergunte ou peça alguma coisa..."
            aria-label="Mensagem para assistente"
            disabled={isStreaming || voiceState === 'listening'}
          />
          <ChatVoiceButton onTranscript={handleVoiceTranscript} onStateChange={setVoiceState} disabled={isStreaming} />
          <button className="ai-send" onClick={()=> handleSend()} disabled={!input.trim() || isStreaming} aria-label="Enviar">
            {isStreaming ? <Loader2 size={18} className="animate-spin"/> : <Send size={18}/>}
          </button>
          <button
            className="icon-button"
            onClick={() => {
              if (ttsRef.current?.isSpeaking()) ttsRef.current.stop()
              else setIsTtsEnabled(v => !v)
            }}
            aria-label={isTtsEnabled ? 'Desativar voz da assistente' : 'Ativar voz da assistente'}
            title={isTtsEnabled ? 'Voz ativada' : 'Voz desativada'}
          >
            {isTtsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
        <p className="ai-input-hint">✦ IA pode cometer erros. Verifique valores antes de aplicar. {voiceState === 'listening' ? 'Ouvindo... fale agora.' : ''}</p>
      </div>
    </div>
  )
}
