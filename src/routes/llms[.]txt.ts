import { createFileRoute } from '@tanstack/react-router'
import { listed, loadAll, text, toPublic } from '~/server/agent'

// llms.txt (https://llmstxt.org): what this site is and how an agent should use it.
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const o = new URL(request.url).origin
        const all = await loadAll()
        const list = listed(all)
        const top = list.filter((g) => g.score).slice(0, 15).map((g) => toPublic(g, o))
        return text(`# MCP Consents

> A ranked collection of the OAuth consent screens (sign-in, account selection, consent) behind remote MCP servers from Claude's connector directory and plugin marketplace: what a user sees when they click Connect, which account and permissions are shown, whether permissions can be configured, whether the redirect URL is shown, and how good the UI flow is. ${list.length} consent screens, ${list.filter((g) => g.score).length} scored 0-5.

Built for people and for agents. Everything below is public, read-only and needs no key. Responses allow CORS.

## How scores work

Each server with a visible consent screen is scored 0-5. The tester's own scores are marked \`score_by: "tester"\`; the rest are estimates made with the same criteria:

- account: is the account / workspace / organisation being connected shown (\`picker\`, \`shown\`, \`none\`)
- permissions: are the granted permissions shown, and can they be configured (\`configurable\`, \`list\`, \`summary\`, \`none\`)
- redirect: is the redirect URL shown (\`shown\`, \`warning_only\`, \`none\`) - important for security
- client_identity: is the requesting app's name / logo shown
- ui: tidy, good-looking UI flow (\`polished\`, \`ok\`, \`weak\`, \`broken\`)
- brand: how well the provider's brand is presented (\`strong\`, \`ok\`, \`weak\`)

No consent screen at all scores 0.

## API

- [All consent screens, ranked](${o}/api/gateways): JSON. Query parameters: \`q\` (text search), \`sort\` (\`score\` default, or \`name\`), \`min_score\`, \`account\`, \`permissions\`, \`redirect\`, \`ui\`, \`brand\` (criteria values above), \`first_screen\` (\`consent\`, \`login\`, ...), \`signed_in=true\` (recorded past sign-in), \`scored=true\`, \`include_blocked=true\`, \`limit\` (max 500), \`offset\`, \`format=md\` (markdown instead of JSON).
- [One server](${o}/api/gateways/linear): JSON record by id; add \`?format=md\` for markdown.
- [Everything as markdown](${o}/llms-full.txt): the full ranked list in one document.
- Human pages: \`${o}/g/<id>\`.
- [Skill](${o}/skill.md): SKILL.md for coding agents. Audit and rewrite an MCP server's OAuth consent flow (account and workspace selection, configurable permissions, redirect URL, client identity, UI, post-authorization screen) by these criteria.

Examples:
- Best consent screens that let users configure permissions: ${o}/api/gateways?permissions=configurable&min_score=4
- Consent screens that show the redirect URL, as markdown: ${o}/api/gateways?redirect=shown&format=md
- Search: ${o}/api/gateways?q=stripe

## Top ${top.length}

${top.map((p) => `- [${p.name}](${p.page}): ${p.score?.toFixed(1)}/5${p.verdict ? ` - ${p.verdict}` : ''}`).join('\n')}

## Notes

- Captures use a test client named "MCP Consents" (not Claude), so the app name on consent screens differs from what Claude users see.
- Personal names, emails and account names in screenshots are partly pixelated.
- "Blocked" servers (work email required, paid plan, errors) are excluded unless \`include_blocked=true\`.
`)
      },
    },
  },
})
