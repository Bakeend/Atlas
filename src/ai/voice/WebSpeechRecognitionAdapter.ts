import type { SpeechRecognitionService } from './SpeechRecognitionService'

type WebkitWindow = Window & {
  webkitSpeechRecognition?: new () => WebSpeechRecognition
  SpeechRecognition?: new () => WebSpeechRecognition
}

interface WebSpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { results: Array<Array<{ transcript: string }>>; resultIndex: number }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export class WebSpeechRecognitionAdapter implements SpeechRecognitionService {
  private recognition: WebSpeechRecognition | null = null
  private transcript = ''
  private resolveStop: ((v: string) => void) | null = null
  private rejectStop: ((e: Error) => void) | null = null

  onResult?: (transcript: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onStateChange?: (state: 'idle' | 'listening' | 'processing') => void

  isSupported(): boolean {
    const w = window as WebkitWindow
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
  }

  async start(): Promise<void> {
    if (!this.isSupported()) throw new Error('Reconhecimento de voz não suportado neste navegador')
    const w = window as WebkitWindow
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) throw new Error('API não disponível')
    this.transcript = ''
    this.recognition = new Ctor()
    this.recognition.continuous = false
    this.recognition.interimResults = true
    this.recognition.lang = 'pt-BR'
    this.recognition.onstart = () => this.onStateChange?.('listening')
    this.recognition.onresult = e => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const t = r[0]?.transcript ?? ''
        // interim vs final detection via isFinal flag if present
        const isFinal = (r as unknown as { isFinal?: boolean }).isFinal ?? i === e.results.length - 1
        if (isFinal) final += t
        else interim += t
      }
      const cur = final || interim
      this.transcript = cur
      this.onResult?.(cur, !!final)
    }
    this.recognition.onerror = e => {
      this.onError?.(e.error)
      this.onStateChange?.('idle')
      this.rejectStop?.(new Error(e.error))
      this.cleanup()
    }
    this.recognition.onend = () => {
      this.onStateChange?.('idle')
      if (this.resolveStop) {
        this.resolveStop(this.transcript.trim())
        this.cleanup()
      }
    }
    this.recognition.start()
  }

  stop(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        resolve(this.transcript.trim())
        return
      }
      this.resolveStop = resolve
      this.rejectStop = reject
      this.onStateChange?.('processing')
      try {
        this.recognition.stop()
      } catch (e) {
        // if already stopped
        resolve(this.transcript.trim())
        this.cleanup()
      }
      // timeout fallback
      setTimeout(() => {
        if (this.resolveStop) {
          resolve(this.transcript.trim())
          this.cleanup()
        }
      }, 8000)
    })
  }

  cancel(): void {
    try { this.recognition?.abort() } catch {}
    this.cleanup()
    this.onStateChange?.('idle')
  }

  private cleanup() {
    this.recognition = null
    this.resolveStop = null
    this.rejectStop = null
  }
}

// Fallback que nunca grava, só informa indisponibilidade (01:40, 01:61)
export class NoopSpeechRecognitionService implements SpeechRecognitionService {
  isSupported(): boolean { return false }
  async start(): Promise<void> { throw new Error('Seu navegador não oferece reconhecimento de voz. Você ainda pode escrever sua pergunta.') }
  async stop(): Promise<string> { return '' }
  cancel(): void {}
}
