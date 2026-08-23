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

async function ensureMicrophoneAccess(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return

  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Permissão do microfone negada'
      : 'Não foi possível acessar o microfone'
    throw new Error(message)
  } finally {
    stream?.getTracks().forEach(track => track.stop())
  }
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

    await ensureMicrophoneAccess()

    const w = window as WebkitWindow
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) throw new Error('API não disponível')

    this.cleanup()
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
        const isFinal = (r as unknown as { isFinal?: boolean }).isFinal ?? i === e.results.length - 1
        if (isFinal) final += t
        else interim += t
      }
      const current = (final || interim).trim()
      if (current) this.transcript = current
      this.onResult?.(current, !!final)
    }
    this.recognition.onerror = e => {
      const reject = this.rejectStop
      this.onError?.(e.error)
      this.onStateChange?.('idle')
      this.cleanup()
      reject?.(new Error(e.error))
    }
    this.recognition.onend = () => {
      const transcript = this.transcript.trim()
      const resolve = this.resolveStop
      this.onStateChange?.('idle')
      this.cleanup()
      resolve?.(transcript)
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
      } catch {
        const transcript = this.transcript.trim()
        this.cleanup()
        resolve(transcript)
        return
      }

      setTimeout(() => {
        if (!this.resolveStop) return
        const transcript = this.transcript.trim()
        const pendingResolve = this.resolveStop
        this.cleanup()
        pendingResolve?.(transcript)
      }, 5000)
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

export class NoopSpeechRecognitionService implements SpeechRecognitionService {
  isSupported(): boolean { return false }
  async start(): Promise<void> { throw new Error('Seu navegador não oferece reconhecimento de voz. Você ainda pode escrever sua pergunta.') }
  async stop(): Promise<string> { return '' }
  cancel(): void {}
}
