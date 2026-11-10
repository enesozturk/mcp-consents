// Server entry: TanStack Start's default handler plus security headers on every response
// the Worker produces (pages, server functions, /api, /llms.txt). Static files served
// straight from Cloudflare's asset store get the same headers from public/_headers.
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'
import { SECURITY_HEADERS, CONTENT_SECURITY_POLICY } from './server/security'

const handler = createStartHandler(defaultStreamHandler)

function secure(res: Response): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v)
  // Vite's dev client needs inline/eval and a websocket, so the policy only applies to builds.
  if (import.meta.env.PROD && (out.headers.get('content-type') ?? '').includes('text/html')) {
    out.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  }
  return out
}

// The site was called MCP Gateways at gateways.ozturkenes.com; old links keep working.
const OLD_HOST = 'gateways.ozturkenes.com'
const HOST = 'consents.ozturkenes.com'

export default createServerEntry({
  fetch: async (request, opts) => {
    const url = new URL(request.url)
    if (url.hostname === OLD_HOST) {
      url.hostname = HOST
      return secure(Response.redirect(url.toString(), 301))
    }
    return secure(await handler(request, opts))
  },
})
