import { createFileRoute } from '@tanstack/react-router'
import summary from '~/data/summary.json'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: 'About MCP Consents' },
      { name: 'description', content: 'How the MCP consent screens were captured and scored, and how agents can read the collection.' },
    ],
  }),
  component: About,
})

function About() {
  return (
    <main className="wrap">
      <article className="prose">
        <h1>About this collection</h1>
        <p>
          When you connect an MCP server to Claude, the provider shows its sign-in and consent screens. This site
          collects those screens for the remote MCP servers in Claude's connector directory and plugin marketplace, and
          ranks them.
        </p>

        <h2>How the screens were captured</h2>
        <ol>
          <li>
            Each server got the same steps a real MCP client follows: an <code>initialize</code> request, OAuth
            metadata discovery, dynamic client registration and a PKCE authorization link.
          </li>
          <li>The first screen was captured automatically at 1440×900, twice the pixel density, in light and dark and on a phone width.</li>
          <li>
            A person then signed in with a test account and recorded every screen up to the consent step. Nothing was
            approved on purpose.
          </li>
        </ol>
        <p>
          The requesting app is a test client named “MCP Consents”, not Claude, so its name appears on consent
          screens where Claude's would. Names, emails and account names from the test account are partly pixelated.
        </p>

        <h2>How consent screens are scored</h2>
        <p>Every server with a visible consent or authorization screen gets a score from 0 to 5. It rewards a consent flow that:</p>
        <ul>
          <li>
            shows which account, workspace or organization you are connecting, and lets you <strong>choose</strong> it:
            switching accounts and picking workspaces on the consent screen is one of the most important criteria;
          </li>
          <li>shows the permissions you grant in plain language, and lets you configure them (read or write, per resource);</li>
          <li>shows where you will be sent back to (the redirect URL), which matters for security;</li>
          <li>presents its brand and the requesting app clearly;</li>
          <li>has a tidy, considered, good-looking flow, including sign-up that returns to the consent screen and a clear screen after approval.</li>
        </ul>
        <p>
          A server with no consent screen at all scores 0. Scores marked “tester” were given by hand; the rest are estimates
          made against the tester's own scores and notes.
        </p>

        <h2>What is not in the ranking</h2>
        <p>
          Of the {summary.reviewed} servers reviewed, {summary.ranked} are ranked. {summary.not_ranked} are listed as rejected
          (no consent screen, or the flow could not be recorded past sign-in). The other {summary.removed_total} were
          left out before ranking: {summary.removed.map((r) => `${r.count} ${r.label}`).join('; ')}. Scoring a gateway
          that a personal account cannot reach, or one that sits behind a paywall, would not be fair.
        </p>

        <h2>Use the criteria on your own consent flow</h2>
        <p>
          The same criteria are written up as a <a href="/skill">skill for coding agents</a>. Give it to your agent and it
          will review your MCP server’s sign-in and consent screens, score them and rewrite them.
        </p>

        <h2>For agents</h2>
        <p>
          The collection is meant to be read by agents as well as people. Point yours at <a href="/llms.txt">/llms.txt</a>.
          The ranked list is available as JSON at <a href="/api/gateways">/api/gateways</a>, with search, filters for each
          criterion and a markdown format, and the whole list as one document at <a href="/llms-full.txt">/llms-full.txt</a>.
        </p>
      </article>
    </main>
  )
}
