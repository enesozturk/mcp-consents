import { createFileRoute } from '@tanstack/react-router'
import { text } from '~/server/agent'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const o = new URL(request.url).origin
        return text(`User-agent: *\nAllow: /\n\nSitemap: ${o}/sitemap.xml\n# Agents: see ${o}/llms.txt\n`)
      },
    },
  },
})
