import { openRouterTools } from '../tools/registry'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

export interface AiRequest {
  messages: ChatMessage[]
  model?: string
  signal?: AbortSignal
}

export async function requestAI({ messages, model, signal }: AiRequest): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 40000)
  const combinedSignal = signal ? anySignal([signal, controller.signal]) : controller.signal

  try {
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model ?? 'deepseek/deepseek-v4-flash-0731',
        messages,
        tools: openRouterTools,
        tool_choice: 'auto',
        temperature: 0.2,
      }),
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
      console.debug('[AI] usage', json.usage, 'model', json.model)
      // optional local metric storage
      const key = 'ai-metrics'
      const prev = JSON.parse(localStorage.getItem(key) ?? '[]')
      prev.push({ ts: new Date().toISOString(), model: json.model, usage: json.usage, latency: 0 })
      if (prev.length>100) prev.splice(0, prev.length-100)
      localStorage.setItem(key, JSON.stringify(prev))
    } catch {}

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
