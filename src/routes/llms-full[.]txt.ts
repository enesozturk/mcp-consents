import { createFileRoute } from '@tanstack/react-router'
import { listed, loadAll, text, toMarkdown, toPublic } from '~/server/agent'

// The whole ranked collection as one markdown document, for agents that read a single file.
export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const o = new URL(request.url).origin
        const list = listed(await loadAll())
        const ranked = [...list].sort((a, b) => (b.score?.value ?? -1) - (a.score?.value ?? -1) || a.name.localeCompare(b.name))
        const body = ranked.map((g, i) => toMarkdown(toPublic(g, o), i + 1)).join('\n\n')
        return text(`# MCP Consents: full ranked list\n\nScores are 0-5 (see ${o}/llms.txt for criteria and the JSON API).\n\n${body}\n`, 'text/markdown')
      },
    },
  },
})
