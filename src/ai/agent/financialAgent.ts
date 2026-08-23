import { runAgentLoop } from './agentLoop'
import type { ChatMessage } from '../services/openRouterClient'

export function createFinancialAgent() {
  return {
    async chat(userMessage: string, history: ChatMessage[], opts?: { signal?: AbortSignal; onStep?: (s:string)=>void }) {
      return runAgentLoop(userMessage, history, { onStep: opts?.onStep, signal: opts?.signal })
    }
  }
}
