export type AiProvider = 'openai' | 'opencode' | 'openrouter'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
  // Alguns modelos reasoning (ex.: DeepSeek via OpenCode) exigem que este campo
  // seja reenviado nas próximas etapas após tool calls.
  reasoning_content?: string
}

export interface AiRequest {
  messages: ChatMessage[]
  model?: string
  provider?: AiProvider
  signal?: AbortSignal
  tools?: unknown[]
}

// Teto de resposta — respostas do assistente são curtas e estruturadas
const MAX_TOKENS = 700

export async function requestAI({ messages, model, provider, signal, tools }: AiRequest): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 40000)
  const combinedSignal = signal ? anySignal([signal, controller.signal]) : controller.signal
  const startedAt = Date.now()

  try {
    const payload: Record<string, unknown> = {
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
    }
    if (model) payload.model = model
    if (provider) payload.provider = provider

    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: combinedSignal,
    })
    clearTimeout(timeout)
    const text = await r.text()
    let json: any
    try { json = JSON.parse(text) } catch { throw new Error(text.slice(0, 800) || `HTTP ${r.status}`) }

    if (!r.ok) {
      const msg = json?.error?.message ?? json?.error ?? text.slice(0,500)
      const code = json?.code ?? json?.error?.code
      const cleanMsg = typeof msg === 'string' ? msg.slice(0,500) : msg
      const err: any = new Error(cleanMsg || `Erro ${r.status}`)
      err.status = r.status
      err.code = code
      if (r.status === 429) err.code = 'RATE_LIMIT'
      if (r.status === 503 && code==='NOT_CONFIGURED') err.code = 'NOT_CONFIGURED'
      throw err
    }

    // metrics logging (no sensitive data)
    try {
      const latencyMs = Date.now() - startedAt
      const activeProvider = r.headers.get('x-ai-provider') || json.provider || provider || 'server-default'
      console.debug('[AI] usage', json.usage, 'provider', activeProvider, 'model', json.model, `latency ${latencyMs}ms`)
      const key = 'ai-metrics'
      const prev = JSON.parse(localStorage.getItem(key) ?? '[]')
      prev.push({ ts: new Date().toISOString(), provider: activeProvider, model: json.model, usage: json.usage, latency: latencyMs })
      if (prev.length>100) prev.splice(0, prev.length-100)
      localStorage.setItem(key, JSON.stringify(prev))
    } catch { /* métrica local é best-effort; nunca afeta a resposta */ }

    return json
  } catch (e:any) {
    clearTimeout(timeout)
    if (e?.name==='AbortError') throw new Error('Tempo esgotado ao contatar assistente. Tente novamente.')
    throw e
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const c = new AbortController()
  for (const s of signals) {
    if (s.aborted) c.abort((s as any).reason)
    s.addEventListener('abort', () => c.abort((s as any).reason), { once: true })
  }
  return c.signal
}
