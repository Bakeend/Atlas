import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Square } from 'lucide-react'
import { WebSpeechRecognitionAdapter, NoopSpeechRecognitionService } from '../voice/WebSpeechRecognitionAdapter'
import { CapacitorSpeechRecognitionAdapter } from '../voice/CapacitorSpeechRecognitionAdapter'
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
  const [voiceError, setVoiceError] = useState('')

  useEffect(() => {
    const native = new CapacitorSpeechRecognitionAdapter()
    const web = new WebSpeechRecognitionAdapter()
    const svc: SpeechRecognitionService = native.isSupported()
      ? native
      : web.isSupported()
        ? web
        : new NoopSpeechRecognitionService()

    serviceRef.current = svc
    setSupported(svc.isSupported())

    if (!svc.isSupported()) return

    svc.onResult = (transcript) => {
      setInterim(transcript)
    }
    svc.onStateChange = s => {
      setState(s)
      onStateChange?.(s)
    }
    svc.onError = (message) => {
      setVoiceError(message)
      setState('idle')
      onStateChange?.('idle')
    }
  }, [onStateChange])

  const handleToggle = async () => {
    const svc = serviceRef.current
    if (!svc || disabled) return

    setVoiceError('')

    if (state === 'idle') {
      setInterim('')
      try {
        await svc.start()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível iniciar o microfone'
        setVoiceError(message)
        setState('idle')
        onStateChange?.('idle')
      }
      return
    }

    if (state === 'listening') {
      setState('processing')
      try {
        const text = await svc.stop()
        setState('idle')
        setInterim('')
        if (text.trim()) onTranscript(text.trim())
        else setVoiceError('Não consegui identificar sua fala. Tente novamente.')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao finalizar gravação'
        setVoiceError(message)
        setState('idle')
      }
    }
  }

  const handleCancel = () => {
    serviceRef.current?.cancel()
    setState('idle')
    setInterim('')
    setVoiceError('')
  }

  if (!supported) {
    return (
      <button
        type="button"
        className="ai-voice-btn"
        disabled
        aria-label="Reconhecimento de voz não disponível neste dispositivo"
        title="Reconhecimento de voz não disponível. Você ainda pode escrever."
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
        disabled={disabled || state === 'processing'}
        aria-label={state === 'listening' ? 'Parar gravação' : 'Iniciar conversa por voz'}
        aria-pressed={state === 'listening'}
        title={voiceError || (state === 'listening' ? 'Toque para finalizar' : 'Falar com a assistente')}
      >
        {state === 'listening' ? <Square size={18} className="text-white" /> : <Mic size={18} />}
      </button>
      {state === 'listening' && (
        <button className="ai-voice-cancel" onClick={handleCancel} aria-label="Cancelar gravação">Cancelar</button>
      )}
      {voiceError && <span className="sr-only" role="alert">{voiceError}</span>}
      {interim && <span className="sr-only" aria-live="polite">{interim}</span>}
    </div>
  )
}
