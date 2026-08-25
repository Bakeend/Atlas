import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Quando for ativar PWA/Capacitor (não rodar build ainda):
// 1) npm i -D vite-plugin-pwa
// 2) descomente o import e o bloco VitePWA abaixo
// import { VitePWA } from 'vite-plugin-pwa'

function aiApiPlugin() {
  return {
    name: 'ai-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/ai')) return next()
        // CORS preflight
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
            const apiKey = process.env.OPENROUTER_API_KEY
            const mock = process.env.AI_MOCK === 'true'

            // Mock mode for local dev without credits
            if (mock) {
              const messages = json.messages ?? []
              const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({
                choices: [{ message: { role: 'assistant', content: `[MOCK] Você disse: ${String(lastUser).slice(0, 120)}. Configure OPENROUTER_API_KEY para usar DeepSeek real.`, tool_calls: [] } }],
                usage: { prompt_tokens: 0, completion_tokens: 0 },
                mock: true,
              }))
              return
            }

            if (!apiKey) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ error: 'Assistente não configurado. Defina OPENROUTER_API_KEY no arquivo .env.', code: 'NOT_CONFIGURED' }))
              return
            }

            const model = json.model || process.env.OPENROUTER_MODEL
            if (!model) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ error: 'Modelo não configurado. Defina OPENROUTER_MODEL no arquivo .env (ex: deepseek/deepseek-chat).', code: 'MODEL_NOT_CONFIGURED' }))
              return
            }

            const siteUrl = process.env.OPENROUTER_SITE_URL || 'http://localhost:5173'
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
            res.statusCode = r.status
            res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            // forward rate-limit headers if present
            const rl = r.headers.get('x-ratelimit-remaining')
            if (rl) res.setHeader('X-RateLimit-Remaining', rl)
            res.end(text)
          } catch (e: any) {
            const isAbort = e?.name === 'AbortError'
            res.statusCode = isAbort ? 504 : 500
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify({ error: isAbort ? 'Timeout ao contatar OpenRouter' : (e?.message || 'Erro interno'), code: isAbort ? 'TIMEOUT' : 'INTERNAL' }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    aiApiPlugin(),
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   includeAssets: ['icons/*'],
    //   manifest: false, // usamos public/manifest.webmanifest
    //   workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    // }),
  ],
})
