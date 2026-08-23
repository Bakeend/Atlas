export interface TextToSpeechService {
  isSupported(): boolean
  speak(text: string): Promise<void>
  stop(): void
  pause(): void
  resume(): void
  isSpeaking(): boolean
}
