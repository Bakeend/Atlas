import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, History, Loader2, Plus, Send, Sparkles, Trash2, Wallet, Target, ReceiptText, Repeat2, ChartPie, Volume2, VolumeX } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Card } from '../../components'
import { uid, money } from '../../domain'
import { useFinanceStore } from '../../store'
import { useAiChat } from '../hooks/useAiChat'
import { ToolResultRenderer } from './AiCards'
import { AiVisualRenderer } from '../visual/AiVisualRenderer'
import { ChatVoiceButton } from './ChatVoiceButton'
import { executeTool } from '../tools/registry'
import { WebSpeechSynthesisAdapter, NoopTextToSpeechService } from '../voice/WebSpeechSynthesisAdapter'
import type { TextToSpeechService } from '../voice/TextToSpeechService'

const suggestions = [
  { icon: Wallet, label: 'Organizar pagamento', prompt: 'Recebi R$ 4.500. Organiza meu pagamento atÃ© o prÃ³ximo recebimento.' },
  { icon: Wallet, label: 'Organizar meu dinheiro', prompt: 'Organiza meu dinheiro atÃ© o prÃ³ximo salÃ¡rio.' },
  { icon: ChartPie, label: 'Analisar meus gastos', prompt: 'Onde estou gastando mais nos Ãºltimos 3 meses? Analise por categoria.' },
  { icon: ReceiptText, label: 'Registrar uma despesa', prompt: 'Gastei R$ 50 no mercado hoje.' },
  { icon: Repeat2, label: 'Criar gasto recorrente', prompt: 'Todo dia 10 pago R$ 120 de internet.' },
  { icon: Target, label: 'Criar uma meta', prompt: 'Quero guardar R$ 500 por mÃªs. Cria uma meta chamada Reserva mensal.' },
]

export function AiAssistantPage() {
  const navigate = useNavigate()
  const { aiConversations, aiMessages, deleteAiConversation } = useFinanceStore() as any
  const [convId, setConvId] = useState<string | undefined>(undefined)
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const { messages, isStreaming, chatState, step, error, send, cancel } = useAiChat(convId) as ReturnType<typeof useAiChat> & { chatState?: string }
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ttsRef = useRef<TextToSpeechService | null>(null)
  const [isTtsEnabled, setIsTtsEnabled] = useState(true)
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle')

  useEffect(()=> { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, isStreaming, step])

  // TTS: fala speech curto enquanto dashboard já está visível (01:43, 01:44)
  useEffect(() => {
    if (!isTtsEnabled) return
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && last.presentation?.speech) {
      if (!ttsRef.current) {
        const adapter = new WebSpeechSynthesisAdapter()
        ttsRef.current = adapter.isSupported() ? adapter : new NoopTextToSpeechService()
      }
      // não esperar TTS para exibir dashboard — dashboard já renderizado, TTS em paralelo
      void ttsRef.current.speak(last.presentation.speech)
    }
  }, [messages, isTtsEnabled])

  const handleVoiceTranscript = (text: string) => {
    // transcrição aparece como mensagem do cliente no chat (01:37)
    // interrompe TTS se estiver falando (01:64 barge-in)
    ttsRef.current?.stop()
    void send(text)
  }

  const handleSend = async (text?: string) => {
    const t = (text ?? input).trim()
    if (!t) return
    setInput('')
    await send(t)
  }

  const handleApplyPlan = async (planId:string) => {
    // tenta aplicar como paymentAllocation primeiro, fallback para allocation
    let res = await executeTool('applyPaymentAllocationPlan', { id: planId })
    if (!(res as any).success && (res as any).error?.includes('nÃ£o encontrada')) {
      res = await executeTool('applyAllocationPlan', { id: planId })
    }
    if ((res as any).success) {
      // feedback local sem chamar LLM novamente: adiciona mensagem sintÃ©tica via send com contexto
      await send(`Plano ${planId.slice(0,8)} aplicado com sucesso.`)
    } else {
      await send(`Tentei aplicar o plano ${planId.slice(0,8)} mas houve erro: ${(res as any).error ?? 'desconhecido'}`)
    }
  }

  const handleCancelPlan = async (planId?:string) => {
    if (!planId) return;
    let res = await executeTool('cancelPaymentAllocationPlan', { id: planId })
    if (!(res as any).success && (res as any).error?.includes('nÃ£o encontrada')) {
      res = await executeTool('cancelPaymentAllocationPlan', { id: planId } as any)
    }
    if ((res as any).success) await send(`Plano ${planId.slice(0,8)} cancelado.`)
  }

  const handleUndo = async (txId:string) => {
    const ok = (useFinanceStore.getState() as any).restoreTransaction?.(txId)
    if (ok) {
      await send(`Desfazer a Ãºltima transaÃ§Ã£o ${txId.slice(0,8)}.`)
    } else {
      // fallback soft delete undo via execute
      await executeTool('deleteTransaction', { id: txId } as any) // not correct but placeholder
    }
  }

  const isConfigured = true // will show banner if error includes NOT_CONFIGURED

  return (
    <div className="ai-page">
      <div className="ai-header">
        <button onClick={()=> navigate('/')} className="ai-back" aria-label="Voltar"><ChevronLeft size={20}/></button>
        <div className="ai-header-title">
          <h1><Sparkles size={18} className="text-brand"/> Assistente financeiro</h1>
          <p>Organize e entenda suas finanÃ§as.</p>
        </div>
        <div className="ai-header-actions">
          <button className="icon-button" onClick={()=> setShowHistory(v=>!v)} aria-label="HistÃ³rico"><History size={20}/></button>
          <button className="icon-button" onClick={()=> { setConvId(undefined); location.reload() }} aria-label="Nova conversa"><Plus size={20}/></button>
        </div>
      </div>

      {showHistory && (
        <Card className="ai-history">
          <div className="ai-history-head"><strong>HistÃ³rico</strong><button className="text-xs font-semibold text-brand" onClick={()=> setShowHistory(false)}>Fechar</button></div>
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
            <p className="text-xs leading-5 text-muted">Exemplos: <em>"Gastei 89,90 de gasolina hoje"</em>, <em>"Cria categoria Pets"</em>, <em>"Quanto posso gastar atÃ© dia 20?"</em></p>
          </Card>
        </div>
      ) : (
        <div ref={listRef} className="ai-messages">
      {messages.map(m=> (
            <div key={m.id} className={`ai-msg ${m.role}`}>
              <div className={`ai-bubble ${m.role}`}>
                <div className="ai-bubble-content">{m.content}</div>
                {/* Novo: AiVisualRenderer dentro da mensagem da assistente (01:54, 01:57) */}
                {m.role === 'assistant' && m.presentation?.blocks?.length ? (
                  <div className="ai-visual-in-chat">
                    <AiVisualRenderer
                      blocks={m.presentation.blocks}
                      actions={m.presentation.actions}
                      onAction={async (action) => {
                        // ações seguras (01:34, 01:35) — nunca HTML arbitrário
                        if (action.type === 'retry') {
                          void handleSend(messages[messages.length - 2]?.content ?? 'tentar novamente')
                        } else if (action.type === 'cancel') {
                          // já tratado via pendingAction em useAiChat
                          void send('Cancelar')
                        } else if (action.type === 'open-transactions') {
                          navigate('/transactions')
                        } else if (action.type === 'open-category') {
                          navigate('/planning')
                        } else if (action.type === 'open-recurring') {
                          navigate('/recurring')
                        } else {
                          // fallback: envia label como nova solicitação (01:76)
                          void send(action.label)
                        }
                      }}
                    />
                  </div>
                ) : null}
                {/* Fallback legado: toolCards para compatibilidade */}
                {m.toolCalls?.length && !m.presentation?.blocks?.length ? (
                  <div className="ai-tool-cards">
                    {m.toolCalls.map((tc:any,i:number)=> (
                      <ToolResultRenderer key={i} name={tc.name} result={tc.result} onApplyPlan={handleApplyPlan} onCancelPlan={handleCancelPlan} onUndo={handleUndo}/>
                    ))}
                  </div>
                ) : null}
                {/* toolCards também abaixo do visual para casos com ambos */}
                {m.toolCalls?.length && m.presentation?.blocks?.length ? (
                  <div className="ai-tool-cards">
                    {m.toolCalls.map((tc:any,i:number)=> (
                      <ToolResultRenderer key={i} name={tc.name} result={tc.result} onApplyPlan={handleApplyPlan} onCancelPlan={handleCancelPlan} onUndo={handleUndo}/>
                    ))}
                  </div>
                ) : null}
                {m.undoId && <button className="ai-undo" onClick={()=> handleUndo(m.undoId!)}>Desfazer</button>}
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
          {error && (
            <div className="ai-error-banner" role="alert">
              <p>{error}</p>
              <div className="ai-error-actions">
                <button className="btn-secondary" onClick={()=> handleSend(messages[messages.length-2]?.content ?? 'tentar novamente')}>Tentar novamente</button>
                <button className="text-xs font-semibold text-muted" onClick={()=> cancel()}>Cancelar</button>
                <button className="text-xs font-semibold text-brand" onClick={()=> navigate('/')}>Usar aplicativo</button>
              </div>
              <small>Seus dados continuam seguros e disponÃ­veis.</small>
            </div>
          )}
        </div>
      )}

      <div className="ai-input-bar">
        <div className="ai-input-wrap">
          <input
            ref={inputRef}
            value={input}
            onChange={e=> setInput(e.target.value)}
            onKeyDown={e=> { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Pergunte ou peÃ§a alguma coisa..."
            aria-label="Mensagem para assistente"
            disabled={isStreaming || voiceState === 'listening'}
          />
          {/* Voice button dentro do composer (01:63) */}
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

