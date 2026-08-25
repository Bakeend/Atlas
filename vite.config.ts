import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// Quando for ativar PWA/Capacitor (não rodar build ainda):
// 1) npm i -D vite-plugin-pwa
// 2) descomente o import e o bloco VitePWA abaixo
// import { VitePWA } from 'vite-plugin-pwa'

type AiProvider = 'openai' | 'opencode' | 'openrouter'
const DEFAULT_OPENCODE_MODEL = 'mimo-v2.5-free'

function aiApiPlugin(mode: string) {
  return {
    name: 'ai-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/ai')) return next()

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        let body = ''
        req.on('data', (chunk: any) => { body += chunk })
        req.on('end', async () => {
          try {
            const json = body ? JSON.parse(body) : {}
            const env = loadEnv(mode, process.cwd(), '')
            const mock = (env.AI_MOCK || process.env.AI_MOCK) === 'true'
            const provider = (json.provider || env.AI_PROVIDER || process.env.AI_PROVIDER || 'opencode') as AiProvider

            if (!['openai', 'opencode', 'openrouter'].includes(provider)) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: `Provedor inválido: ${provider}`, code: 'INVALID_PROVIDER' }))
              return
            }

            if (mock) {
              const messages = json.messages ?? []
              const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.setHeader('X-AI-Provider', provider)
              res.end(JSON.stringify({
                choices: [{ message: { role: 'assistant', content: `[MOCK/${provider}] Você disse: ${String(lastUser).slice(0, 120)}.`, tool_calls: [] } }],
                usage: { prompt_tokens: 0, completion_tokens: 0 },
                provider,
                mock: true,
              }))
              return
            }

            let apiKey = ''
            let model = json.model
            let url = ''
            let extraHeaders: Record<string, string> = {}

            if (provider === 'openai') {
              apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''
              model = model || env.OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini'
              url = env.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions'
            } else if (provider === 'opencode') {
              apiKey = env.OPENCODE_API_KEY || process.env.OPENCODE_API_KEY || ''
              model = model || env.OPENCODE_MODEL || process.env.OPENCODE_MODEL || DEFAULT_OPENCODE_MODEL
              url = env.OPENCODE_BASE_URL || process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1/chat/completions'
            } else {
              apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || ''
              model = model || env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL
              url = 'https://openrouter.ai/api/v1/chat/completions'
              extraHeaders = {
                'HTTP-Referer': env.OPENROUTER_SITE_URL || process.env.OPENROUTER_SITE_URL || 'http://localhost:5173',
                'X-Title': env.OPENROUTER_APP_NAME || process.env.OPENROUTER_APP_NAME || 'Atlas Finance',
              }
            }

            if (!apiKey) {
              const envName = provider === 'openai' ? 'OPENAI_API_KEY' : provider === 'opencode' ? 'OPENCODE_API_KEY' : 'OPENROUTER_API_KEY'
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ error: `Assistente não configurado. Defina ${envName} no arquivo .env.`, code: 'NOT_CONFIGURED', provider }))
              return
            }

            if (!model) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ error: `Modelo não configurado para ${provider}.`, code: 'MODEL_NOT_CONFIGURED', provider }))
              return
            }

            const requestBody = {
              model,
              messages: json.messages,
              tools: json.tools,
              tool_choice: json.tool_choice ?? 'auto',
              temperature: json.temperature ?? 0.2,
              max_tokens: json.max_tokens,
            }

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 45000)

            const r = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...extraHeaders,
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            })
            clearTimeout(timeout)

            const text = await r.text()
            res.statusCode = r.status
            res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('X-AI-Provider', provider)
            res.setHeader('X-AI-Model', String(model))
            const rl = r.headers.get('x-ratelimit-remaining')
            if (rl) res.setHeader('X-RateLimit-Remaining', rl)
            res.end(text)
          } catch (e: any) {
            const isAbort = e?.name === 'AbortError'
            res.statusCode = isAbort ? 504 : 500
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify({ error: isAbort ? 'Timeout ao contatar provedor de IA' : (e?.message || 'Erro interno'), code: isAbort ? 'TIMEOUT' : 'INTERNAL' }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    aiApiPlugin(mode),
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   includeAssets: ['icons/*'],
    //   manifest: false, // usamos public/manifest.webmanifest
    //   workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    // }),
  ],
}))
