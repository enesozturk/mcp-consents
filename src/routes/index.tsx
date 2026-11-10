import { useMemo } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { getGallery } from '~/server/gateways'
import type { GatewayCard } from '~/lib/types'
import { Pic } from '~/lib/img'
import summary from '~/data/summary.json'

type Search = { q?: string; blocked?: boolean }

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const flag = (v: unknown) => (v === true || v === '1' || v === 1 || v === 'true' ? true : undefined)

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>): Search => ({ q: str(s.q), blocked: flag(s.blocked) }),
  loader: () => getGallery(),
  head: ({ loaderData }) => ({
    meta: [
      { title: 'MCP Consents' },
      {
        name: 'description',
        content: `${loaderData?.cards.filter((c) => c.score != null).length ?? ''} MCP OAuth gateways ranked by how clearly they show the account, permissions and redirect, and how good their UI flow is.`,
      },
      { property: 'og:title', content: 'MCP Consents' },
      { property: 'og:description', content: 'The sign-in and consent screens behind remote MCP servers, captured and ranked.' },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'MCP Consents',
          description: 'Ranked OAuth authorization screens of remote MCP servers. Agents: see /llms.txt and /api/gateways.',
          itemListOrder: 'https://schema.org/ItemListOrderDescending',
          itemListElement: (loaderData?.cards ?? []).filter((c) => c.score != null && !c.blocked).slice(0, 50).map((c, i) => ({
            '@type': 'ListItem', position: i + 1, url: `https://consents.ozturkenes.com/g/${c.id}`, name: c.name,
          })),
        }),
      },
    ],
  }),
  component: Gallery,
})

function Gallery() {
  const { cards } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  // Ranked order comes from the data (score high to low, then the rest).
  const listed = useMemo(() => cards.filter((c) => !c.blocked && (c.thumb || c.score != null)), [cards])
  const blocked = useMemo(() => cards.filter((c) => c.blocked), [cards])
  const rankOf = useMemo(() => {
    const m = new Map<string, number>()
    listed.filter((c) => c.score != null).forEach((c, i) => m.set(c.id, i + 1))
    return m
  }, [listed])

  const visible = useMemo(() => {
    const q = search.q?.trim().toLowerCase()
    const base = search.blocked ? blocked : listed
    return q ? base.filter((c) => c.q.includes(q)) : base
  }, [listed, blocked, search])

  const scored = listed.filter((c) => c.score != null).length

  return (
    <main className="wrap">
      {!search.q && !search.blocked && (
        <section className="intro">
          <h1>What happens when you click Connect</h1>
          <p>
            The authorization screens behind remote MCP servers, ranked by how clearly they show the account,
            the permissions you grant, where you are sent back to, and how well the whole flow is made.
          </p>
          <div className="facts">
            <span><b>{scored}</b> ranked</span>
            {blocked.length > 0 && (
              <button className="facts-link" onClick={() => navigate({ search: (p) => ({ ...p, blocked: true }), resetScroll: true })}>
                <b>{blocked.length}</b> rejected
              </button>
            )}
            <Link to="/about">How scoring works</Link>
          </div>
        </section>
      )}

      <div className="results-line" style={search.q || search.blocked ? { marginTop: 28 } : undefined}>
        <span>
          {search.blocked
            ? `${visible.length} rejected: no consent screen, or the flow could not be recorded past sign-in`
            : search.q
              ? `${visible.length} result${visible.length === 1 ? '' : 's'} for “${search.q}”`
              : 'Ranked by score'}
        </span>
        {search.blocked && (
          <button onClick={() => navigate({ search: (p) => ({ ...p, blocked: undefined }), replace: true })}>Back to the ranking</button>
        )}
      </div>

      {search.blocked && !search.q && <LeftOut />}

      <section className="grid">
        {visible.map((c) => (
          <Card key={c.id} c={c} rank={rankOf.get(c.id)} />
        ))}
      </section>
      {visible.length === 0 && <p className="none">No consent screens match “{search.q}”.</p>}

      {!search.blocked && blocked.length > 0 && (
        <div className="results-line" style={{ justifyContent: 'center', marginTop: 40 }}>
          <button onClick={() => navigate({ search: (p) => ({ ...p, blocked: true }), resetScroll: true })}>
            Show {blocked.length} rejected (no consent screen, or stuck at sign-in)
          </button>
        </div>
      )}
    </main>
  )
}

// Where the rest went: servers left out after review, grouped by reason (scripts/prepare.cjs).
export function LeftOut() {
  const s = summary
  return (
    <div className="left-out">
      <p>
        Of the <b>{s.reviewed}</b> servers reviewed, <b>{s.ranked}</b> are ranked and <b>{s.not_ranked}</b> are
        rejected below. The other <b>{s.removed_total}</b> were left out before ranking:
      </p>
      <ul>
        {s.removed.map((r) => (
          <li key={r.key}>
            <b>{r.count}</b> {r.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Card({ c, rank }: { c: GatewayCard; rank?: number }) {
  const sub = c.display_host
  return (
    <Link to="/g/$id" params={{ id: c.id }} className="card">
      <div className="frame">
        {c.thumb && <Pic loading="lazy" src={c.thumb} alt={`${c.name} consent screen`} width={960} height={600} />}
      </div>
      <div className="meta">
        {c.favicon ? <img className="fav" src={c.favicon} alt="" loading="lazy" width={22} height={22} /> : <span className="fav" />}
        <div className="t">
          <strong>
            {rank && <span className="rank">{rank}</span>}
            {c.name}
          </strong>
          <span className="sub">{sub}</span>
        </div>
        {c.score != null && (
          <span className={`score${c.score_by === 'tester' ? ' by-tester' : ''}`} title={c.score_by === 'tester' ? 'Scored by the tester' : 'Estimated with the tester’s criteria'}>
            {c.score.toFixed(1)}
          </span>
        )}
      </div>
    </Link>
  )
}
