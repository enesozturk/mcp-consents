import { createFileRoute } from '@tanstack/react-router'
import { listed, loadAll, text } from '~/server/agent'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const o = new URL(request.url).origin
        const urls = ['/', '/about', '/skill', '/skill.md', '/llms.txt', ...listed(await loadAll()).map((g) => `/g/${g.id}`)]
        return text(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${o}${u}</loc></url>`).join('\n')}\n</urlset>\n`,
          'application/xml',
        )
      },
    },
  },
})
