// Vercel / Netlify serverless handler — mesma lógica do Vite middleware
// Nunca exponha OPENROUTER_API_KEY no frontend (sem prefixo VITE_)
export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vercel may already parse json
  const json = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})

  const apiKey = process.env.OPENROUTER_API_KEY
  const mock = process.env.AI_MOCK === 'true'

  if (mock) {
    const messages = json.messages ?? []
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''
    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: `[MOCK] Você disse: ${String(lastUser).slice(0, 120)}. Configure OPENROUTER_API_KEY para usar DeepSeek real.`, tool_calls: [] } }],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      mock: true,
    })
  }

  if (!apiKey) {
    return res.status(503).json({ error: 'Assistente não configurado. Defina OPENROUTER_API_KEY no servidor.', code: 'NOT_CONFIGURED' })
  }

  const model = json.model || process.env.OPENROUTER_MODEL
  if (!model) {
    return res.status(400).json({ error: 'Modelo não configurado. Defina OPENROUTER_MODEL no arquivo .env (ex: deepseek/deepseek-chat).', code: 'MODEL_NOT_CONFIGURED' })
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL || 'https://atlas-finance.app'
  const appName = process.env.OPENROUTER_APP_NAME || 'Atlas Finance'

  const openRouterBody = {
    model,
    messages: json.messages,
    tools: json.tools,
    tool_choice: json.tool_choice ?? 'auto',
    temperature: json.temperature ?? 0.2,
    max_tokens: json.max_tokens,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': siteUrl,
        'X-Title': appName,
      },
      body: JSON.stringify(openRouterBody),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const text = await r.text()
    res.status(r.status)
    const ct = r.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.send(text)
  } catch (e: any) {
    clearTimeout(timeout)
    const isAbort = e?.name === 'AbortError'
    return res.status(isAbort ? 504 : 500).json({ error: isAbort ? 'Timeout ao contatar OpenRouter' : (e?.message || 'Erro interno'), code: isAbort ? 'TIMEOUT' : 'INTERNAL' })
  }
}
