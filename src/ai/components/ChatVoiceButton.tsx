import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Square } from 'lucide-react'
import { WebSpeechRecognitionAdapter, NoopSpeechRecognitionService } from '../voice/WebSpeechRecognitionAdapter'
import type { SpeechRecognitionService } from '../voice/SpeechRecognitionService'

export function ChatVoiceButton({
  onTranscript,
  onStateChange,
  disabled,
}: {
  onTranscript: (text: string) => void
  onStateChange?: (state: 'idle' | 'listening' | 'processing') => void
  disabled?: boolean
}) {
  const serviceRef = useRef<SpeechRecognitionService | null>(null)
  const [state, setState] = useState<'idle' | 'listening' | 'processing'>('idle')
  const [supported, setSupported] = useState(true)
  const [interim, setInterim] = useState('')

  useEffect(() => {
    const svc = new WebSpeechRecognitionAdapter()
    if (!svc.isSupported()) {
      serviceRef.current = new NoopSpeechRecognitionService()
      setSupported(false)
    } else {
      serviceRef.current = svc
      setSupported(true)
      svc.onResult = (transcript, isFinal) => {
        setInterim(transcript)
        if (isFinal && transcript.trim()) {
          // auto stop will handle
        }
      }
      svc.onStateChange = s => {
        setState(s)
        onStateChange?.(s)
      }
      svc.onError = () => {
        setState('idle')
        onStateChange?.('idle')
      }
    }
  }, [onStateChange])

  const handleToggle = async () => {
    const svc = serviceRef.current
    if (!svc || disabled) return
    if (state === 'idle') {
      setInterim('')
      setState('listening')
      try {
        await svc.start()
      } catch {
        setState('idle')
      }
    } else if (state === 'listening') {
      setState('processing')
      try {
        const text = await svc.stop()
        setState('idle')
        setInterim('')
        if (text.trim()) onTranscript(text.trim())
      } catch {
        setState('idle')
      }
    }
  }

  const handleCancel = () => {
    serviceRef.current?.cancel()
    setState('idle')
    setInterim('')
  }

  if (!supported) {
    // Fallback compacto dentro do composer: só ícone desabilitado, texto fica no hint abaixo (não quebra layout)
    return (
      <button
        type="button"
        className="ai-voice-btn"
        disabled
        aria-label="Reconhecimento de voz não disponível neste navegador"
        title="Seu navegador não oferece reconhecimento de voz. Você ainda pode escrever."
      >
        <MicOff size={18} className="text-slate-400" />
      </button>
    )
  }

  return (
    <div className="ai-voice-wrap">
      <button
        type="button"
        className={`ai-voice-btn ${state}`}
        onClick={handleToggle}
        disabled={disabled}
        aria-label={state === 'listening' ? 'Parar gravação' : 'Iniciar conversa por voz'}
        aria-pressed={state === 'listening'}
      >
        {state === 'listening' ? <Square size={18} className="text-white" /> : <Mic size={18} />}
      </button>
      {state === 'listening' && (
        <button className="ai-voice-cancel" onClick={handleCancel} aria-label="Cancelar gravação">Cancelar</button>
      )}
    </div>
  )
}
