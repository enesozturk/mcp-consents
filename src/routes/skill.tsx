import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
// the skill lives in skills/ so `npx skills add enesozturk/mcp-consents` finds it
import skill from '../../skills/mcp-oauth-consent/SKILL.md?raw'

const SITE = 'https://consents.ozturkenes.com'
const SKILL_URL = `${SITE}/skill.md`
const PROMPT = `Read ${SKILL_URL} and use it to review and improve the OAuth authorization screens of our MCP server.`
const INSTALL = 'npx skills add enesozturk/mcp-consents'

export const Route = createFileRoute('/skill')({
  head: () => ({
    meta: [
      { title: 'MCP OAuth consent skill · MCP Consents' },
      { name: 'description', content: 'A skill for coding agents: audit and rewrite an MCP server’s OAuth consent flow by the criteria behind this gallery.' },
      { property: 'og:title', content: 'MCP OAuth consent skill' },
    ],
    links: [{ rel: 'alternate', type: 'text/markdown', href: '/skill.md', title: 'SKILL.md' }],
  }),
  component: SkillPage,
})

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        })
      }}
    >
      {done ? 'Copied' : label}
    </button>
  )
}

function SkillPage() {
  return (
    <main className="wrap skill-page">
      <section className="skill-head">
        <h1>MCP OAuth consent skill</h1>
        <p>
          A skill for coding agents. Give it to Claude Code, Cursor or any agent working on an MCP server, and it will
          audit the server’s sign-in and consent screens against the criteria behind this gallery, score them, and
          rewrite them: account and workspace selection, configurable permissions, the redirect URL, client identity,
          a tidy UI and the screen after approval.
        </p>
      </section>

      <section className="skill-use">
        <div className="skill-card">
          <h2>Give your agent the link</h2>
          <p>Paste this into your agent’s chat:</p>
          <div className="copy-line">
            <code>{PROMPT}</code>
            <CopyButton value={PROMPT} />
          </div>
        </div>
        <div className="skill-card">
          <h2>Install it as a skill</h2>
          <p>
            One command, with the <a href="https://skills.sh">skills</a> CLI. It works with Claude Code, Cursor, Codex and
            other agents that read skills:
          </p>
          <div className="copy-line">
            <code>{INSTALL}</code>
            <CopyButton value={INSTALL} />
          </div>
        </div>
      </section>

      <section className="skill-file" aria-label="SKILL.md">
        <div className="skill-file-bar">
          <span className="skill-file-name">SKILL.md</span>
          <span className="skill-file-actions">
            <a href="/skill.md" download="SKILL.md">Download</a>
            <CopyButton value={skill} label="Copy skill" />
          </span>
        </div>
        <pre>
          <code>{skill}</code>
        </pre>
      </section>
    </main>
  )
}
