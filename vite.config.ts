import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import viteReact from '@vitejs/plugin-react'

// Dev-only endpoint for the tester's per-gateway feedback. Notes are written to
// data/raw/feedback.json (git-ignored, on the maintainer's machine). Nothing is
// exposed in production builds.
function feedbackNotes(): Plugin {
  const file = path.resolve(process.env.GATEWAYS_RAW_DIR ?? path.resolve(__dirname, 'data/raw'), 'feedback.json')
  const read = (): Record<string, { note: string; updated_at: string }> =>
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  return {
    name: 'feedback-notes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__feedback', (req, res) => {
        const id = new URL(req.url ?? '', 'http://x').searchParams.get('id') ?? ''
        if (!/^[a-z0-9-]+$/.test(id)) {
          res.statusCode = 400
          return res.end('bad id')
        }
        if (req.method === 'GET') {
          res.setHeader('content-type', 'application/json')
          return res.end(JSON.stringify(read()[id] ?? null))
        }
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            const { note } = JSON.parse(body || '{}') as { note?: string }
            const all = read()
            if (note && note.trim()) all[id] = { note: note.trim(), updated_at: new Date().toISOString() }
            else delete all[id]
            const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)))
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n')
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(all[id] ?? null))
          })
          return
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    feedbackNotes(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart({ server: { entry: 'server.ts' } }),
    viteReact(),
  ],
})
