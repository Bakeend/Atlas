import type { SpeechRecognitionService } from './SpeechRecognitionService'

type PermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

type ListenerHandle = { remove: () => Promise<void> }

type NativeSpeechPlugin = {
  available(): Promise<{ available: boolean }>
  checkPermissions(): Promise<{ speechRecognition: PermissionState }>
  requestPermissions(): Promise<{ speechRecognition: PermissionState }>
  start(options: {
    language: string
    maxResults: number
    prompt?: string
    partialResults: boolean
    popup: boolean
  }): Promise<{ matches?: string[] }>
  stop(): Promise<void>
  addListener(eventName: 'partialResults', listener: (data: { matches?: string[] }) => void): Promise<ListenerHandle> | ListenerHandle
  removeAllListeners(): Promise<void>
}

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean
    Plugins?: {
      SpeechRecognition?: NativeSpeechPlugin
    }
  }
}

export class CapacitorSpeechRecognitionAdapter implements SpeechRecognitionService {
  private transcript = ''
  private partialHandle: ListenerHandle | null = null

  onResult?: (transcript: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onStateChange?: (state: 'idle' | 'listening' | 'processing') => void

  private get plugin(): NativeSpeechPlugin | undefined {
    return (window as CapacitorWindow).Capacitor?.Plugins?.SpeechRecognition
  }

  isSupported(): boolean {
    const capacitor = (window as CapacitorWindow).Capacitor
    return !!capacitor?.isNativePlatform?.() && !!this.plugin
  }

  async start(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) throw new Error('Reconhecimento de voz nativo não disponível')

    const availability = await plugin.available()
    if (!availability.available) throw new Error('Reconhecimento de voz não está disponível neste aparelho')

    let permission = await plugin.checkPermissions()
    if (permission.speechRecognition !== 'granted') {
      permission = await plugin.requestPermissions()
    }
    if (permission.speechRecognition !== 'granted') {
      throw new Error('Permissão do microfone foi negada')
    }

    this.transcript = ''
    await plugin.removeAllListeners().catch(() => undefined)

    const handle = await plugin.addListener('partialResults', data => {
      const current = data.matches?.[0]?.trim() ?? ''
      if (!current) return
      this.transcript = current
      this.onResult?.(current, false)
    })
    this.partialHandle = handle

    this.onStateChange?.('listening')

    try {
      const result = await plugin.start({
        language: 'pt-BR',
        maxResults: 3,
        prompt: 'Fale com o assistente financeiro',
        partialResults: true,
        popup: false,
      })
      const final = result.matches?.[0]?.trim()
      if (final) {
        this.transcript = final
        this.onResult?.(final, true)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao iniciar reconhecimento de voz'
      this.onError?.(message)
      this.onStateChange?.('idle')
      await this.cleanup()
      throw error
    }
  }

  async stop(): Promise<string> {
    const plugin = this.plugin
    if (!plugin) return this.transcript.trim()

    this.onStateChange?.('processing')
    try {
      await plugin.stop()
    } catch {
      // Alguns dispositivos encerram automaticamente ao detectar silêncio.
    }

    const transcript = this.transcript.trim()
    await this.cleanup()
    this.onStateChange?.('idle')
    return transcript
  }

  cancel(): void {
    const plugin = this.plugin
    void plugin?.stop().catch(() => undefined)
    void this.cleanup()
    this.onStateChange?.('idle')
  }

  private async cleanup() {
    await this.partialHandle?.remove().catch(() => undefined)
    this.partialHandle = null
    await this.plugin?.removeAllListeners().catch(() => undefined)
  }
}
