import type { TextToSpeechService } from './TextToSpeechService'

export class WebSpeechSynthesisAdapter implements TextToSpeechService {
  private utterance: SpeechSynthesisUtterance | null = null

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  async speak(text: string): Promise<void> {
    if (!this.isSupported()) return
    // interrompe anterior (barge-in, 01:64)
    this.stop()
    const clean = text.trim().slice(0, 600) // TTS curto (01:44)
    if (!clean) return
    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(clean)
      u.lang = 'pt-BR'
      u.rate = 1
      u.onend = () => { this.utterance = null; resolve() }
      u.onerror = (e) => { this.utterance = null; reject(new Error((e as unknown as { error?: string }).error ?? 'TTS error')) }
      this.utterance = u
      window.speechSynthesis.speak(u)
    })
  }

  stop(): void {
    try { window.speechSynthesis.cancel() } catch {}
    this.utterance = null
  }

  pause(): void {
    try { window.speechSynthesis.pause() } catch {}
  }

  resume(): void {
    try { window.speechSynthesis.resume() } catch {}
  }

  isSpeaking(): boolean {
    return typeof window !== 'undefined' && window.speechSynthesis.speaking
  }
}

export class NoopTextToSpeechService implements TextToSpeechService {
  isSupported(): boolean { return false }
  async speak(): Promise<void> {}
  stop(): void {}
  pause(): void {}
  resume(): void {}
  isSpeaking(): boolean { return false }
}
