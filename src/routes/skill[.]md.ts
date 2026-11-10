import { createFileRoute } from '@tanstack/react-router'
import { text } from '~/server/agent'
import skill from '../../skills/mcp-oauth-consent/SKILL.md?raw'

// The skill as a plain file, for agents and for downloading as SKILL.md.
export const Route = createFileRoute('/skill.md')({
  server: {
    handlers: {
      GET: () => text(skill, 'text/markdown'),
    },
  },
})
