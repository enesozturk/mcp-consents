import { createFileRoute } from '@tanstack/react-router'
import { json, loadAll, text, toMarkdown, toPublic } from '~/server/agent'

// GET /api/gateways/<id>            full public record (JSON)
// GET /api/gateways/<id>?format=md  the same as markdown
export const Route = createFileRoute('/api/gateways/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url)
        const all = await loadAll()
        const g = all.find((x) => x.id === params.id)
        if (!g) return json({ error: 'not_found', id: params.id }, 404)
        const p = toPublic(g, url.origin)
        if (url.searchParams.get('format') === 'md') return text(`${toMarkdown(p)}\n`, 'text/markdown')
        return json(p)
      },
    },
  },
})
