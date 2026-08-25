// Vercel / Netlify serverless handler — mesma lógica do Vite middleware
// Chaves ficam SOMENTE no servidor (nunca usar prefixo VITE_).

type AiProvider = 'openai' | 'opencode' | 'openrouter'

const DEFAULT_OPENCODE_MODEL = 'deepseek-v4-flash-free'

function getProviderConfig(provider: AiProvider, json: any) {
  if (provider === 'openai') {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: json.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions',
      headers: {},
    }
  }

  if (provider === 'opencode') {
    return {
      apiKey: process.env.OPENCODE_API_KEY,
      model: json.model || process.env.OPENCODE_MODEL || DEFAULT_OPENCODE_MODEL,
      url: process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1/chat/completions',
      headers: {},
    }
  }

  // Compatibilidade com instalações antigas do projeto.
  return {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: json.model || process.env.OPENROUTER_MODEL,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://atlas-finance.app',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'Atlas Finance',
    },
  }
}

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

  const json = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const mock = process.env.AI_MOCK === 'true'

  // OpenCode é o padrão porque há modelos gratuitos adequados para o agente.
  // OPENROUTER continua aceito somente para compatibilidade com deploys antigos.
  const provider = (json.provider || process.env.AI_PROVIDER || 'opencode') as AiProvider
  if (!['openai', 'opencode', 'openrouter'].includes(provider)) {
    return res.status(400).json({ error: `Provedor inválido: ${provider}`, code: 'INVALID_PROVIDER' })
  }

  if (mock) {
    const messages = json.messages ?? []
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''
    res.setHeader('X-AI-Provider', provider)
    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: `[MOCK/${provider}] Você disse: ${String(lastUser).slice(0, 120)}.`, tool_calls: [] } }],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      provider,
      mock: true,
    })
  }

  const cfg = getProviderConfig(provider, json)
  if (!cfg.apiKey) {
    const envName = provider === 'openai' ? 'OPENAI_API_KEY' : provider === 'opencode' ? 'OPENCODE_API_KEY' : 'OPENROUTER_API_KEY'
    return res.status(503).json({ error: `Assistente não configurado. Defina ${envName} no servidor.`, code: 'NOT_CONFIGURED', provider })
  }
  if (!cfg.model) {
    return res.status(400).json({ error: `Modelo não configurado para ${provider}.`, code: 'MODEL_NOT_CONFIGURED', provider })
  }

  const body = {
    model: cfg.model,
    messages: json.messages,
    tools: json.tools,
    tool_choice: json.tool_choice ?? 'auto',
    temperature: json.temperature ?? 0.2,
    max_tokens: json.max_tokens,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
        ...cfg.headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const text = await r.text()
    res.status(r.status)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-AI-Provider', provider)
    res.setHeader('X-AI-Model', cfg.model)
    const ct = r.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    return res.send(text)
  } catch (e: any) {
    clearTimeout(timeout)
    const isAbort = e?.name === 'AbortError'
    return res.status(isAbort ? 504 : 500).json({
      error: isAbort ? `Timeout ao contatar ${provider}` : (e?.message || 'Erro interno'),
      code: isAbort ? 'TIMEOUT' : 'INTERNAL',
      provider,
    })
  }
}
