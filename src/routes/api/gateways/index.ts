import { createFileRoute } from '@tanstack/react-router'
import { json, loadAll, query, text, toMarkdown, toPublic } from '~/server/agent'

// GET /api/gateways?q=&sort=score|name&min_score=&account=&permissions=&redirect=&ui=&brand=
//   &first_screen=&signed_in=true&scored=true&include_blocked=true&limit=&offset=&format=json|md
export const Route = createFileRoute('/api/gateways/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const all = await loadAll()
        const r = query(all, url.searchParams)
        const items = r.items.map((g) => toPublic(g, url.origin))
        if (url.searchParams.get('format') === 'md') {
          const head = `# MCP Consents: ${r.total} result(s), showing ${r.offset + 1}-${r.offset + items.length}\n\n`
          return text(head + items.map((p, i) => toMarkdown(p, r.offset + i + 1)).join('\n\n') + '\n', 'text/markdown')
        }
        const next = r.offset + items.length < r.total ? (() => { const n = new URL(url); n.searchParams.set('offset', String(r.offset + items.length)); return n.toString() })() : null
        return json({ total: r.total, limit: r.limit, offset: r.offset, next, items })
      },
    },
  },
})
