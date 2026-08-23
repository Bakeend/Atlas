export interface SpeechRecognitionService {
  isSupported(): boolean
  start(): Promise<void>
  stop(): Promise<string>
  cancel(): void
  onResult?: (transcript: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onStateChange?: (state: 'idle' | 'listening' | 'processing') => void
}
