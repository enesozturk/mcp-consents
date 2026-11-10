import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { getGateway } from '~/server/gateways'
import { FEATURE, KIND, LANDING, METHOD, STATUS } from '~/lib/labels'
import type { Flow, FlowStep, Gateway, Score, Verdict } from '~/lib/types'
import { Pic, avif } from '~/lib/img'

const SITE = 'https://consents.ozturkenes.com'

export const Route = createFileRoute('/g/$id')({
  loader: ({ params }) => getGateway({ data: params.id }),
  head: ({ loaderData }) => {
    const g = loaderData?.gateway
    if (!g) return {}
    const title = `${g.name} MCP consent screen — MCP Consents`
    const desc = g.short_description || g.one_liner || `What connecting ${g.name}'s MCP server looks like.`
    return {
      meta: [
        { title },
        { name: 'description', content: desc },
        { property: 'og:title', content: title },
        { property: 'og:description', content: desc },
        ...(ogImage(g)
          ? [
              { property: 'og:image', content: SITE + ogImage(g) },
              // gateway screens are 1440x900 captures at 2x
              { property: 'og:image:width', content: '2880' },
              { property: 'og:image:height', content: '1800' },
              { property: 'og:image:alt', content: `${g.name}'s MCP gateway screen` },
            ]
          : []),
      ],
      links: [
        { rel: 'alternate', type: 'application/json', href: `/api/gateways/${g.id}` },
        { rel: 'alternate', type: 'text/markdown', href: `/api/gateways/${g.id}?format=md` },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: title,
            description: desc,
            url: `${SITE}/g/${g.id}`,
            ...(ogImage(g) ? { image: SITE + ogImage(g) } : {}),
            about: { '@type': 'SoftwareApplication', name: g.name, url: g.mcp_url, applicationCategory: 'MCP server' },
            ...(g.score
              ? { review: { '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: g.score.value, bestRating: 5, worstRating: 0 }, reviewBody: g.score.reason ?? undefined, author: { '@type': 'Person', name: 'Enes Öztürk' } } }
              : {}),
          }),
        },
      ],
    }
  },
  component: Detail,
})

const ogImage = (g: Gateway) => g.flow?.steps.find((s) => s.kind === 'gateway')?.src ?? g.shots?.light ?? null

type Theme = 'light' | 'dark' | 'mobile'
const THEMES: [Theme, string][] = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['mobile', 'Mobile'],
]
type Mode = 'gateway' | 'journey' | 'before'

// The site focuses on the MCP gateway itself. Sign-in details (journey / before-sign-in tabs,
// sign-in options, first-screen notes) are kept in the data and code but hidden for now;
// set this to true to bring them back.
export const SHOW_SIGN_IN_DETAILS = false

// A click on empty space (the page margins, the gaps between sections, the header bar) or on the
// gateway's name goes back to the list, like closing a lightbox. Clicks on content, controls,
// text or the preview behave as usual.
const CONTENT = 'a, button, input, textarea, select, label, summary, video, img, picture, code, pre, table, h2, h3, p, li, dt, dd, kbd, .browser, .chip, .score-line, .pagerbar, .search, footer, .crumbs, .feedback, .hero .fav'
function useBackdropHome() {
  const navigate = useNavigate()
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return
      const t = e.target as Element | null
      if (!t || t.closest(CONTENT)) return
      if (window.getSelection()?.toString()) return
      navigate({ to: '/' })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [navigate])
}

function Detail() {
  const { gateway: g, prev, next, position, count } = Route.useLoaderData()
  const o = g.oauth
  const blockers = (g.flow?.features ?? []).filter((f) => /required|blocked|error/.test(f))
  const tags = [
    g.landing?.type && LANDING[g.landing.type],
    g.flow?.gateway_count ? 'Recorded signed in' : null,
    g.landing?.idp,
    ...(g.landing?.methods ?? []).map((m) => METHOD[m]),
  ].filter((t, i, a): t is string => !!t && a.indexOf(t) === i)
  useBackdropHome()

  return (
    <main className="wrap detail" key={g.id}>
      <div className="crumbs">
        <Link to="/">All consent screens</Link> / {g.name}
      </div>
      <section className="hero">
        <div className="title">
          {g.favicon && <img className="fav lg" src={g.favicon} alt="" width={44} height={44} />}
          <div>
            <h1>{g.name}</h1>
            {(g.short_description || g.one_liner) && <p>{g.short_description || g.one_liner}</p>}
          </div>
        </div>
        {SHOW_SIGN_IN_DETAILS && tags.length > 0 && (
          <div className="chips" style={{ marginTop: 14 }}>
            {tags.map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
        )}
      </section>

      <Viewer g={g} />

      {import.meta.env.DEV && <FeedbackBox id={g.id} />}

      <div className="cols">
        <div className="panel">
          {g.score && <ScoreBox score={g.score} />}
          {g.editor_note && <p className="editor-note">{g.editor_note}</p>}
          {g.flow && <AfterSignIn flow={g.flow} blocked={g.blocked} verdict={g.verdict} />}
          {!g.flow && g.review?.notes && (
            <>
              <h2>First screen</h2>
              <p>{g.review.notes}</p>
            </>
          )}
          {!!blockers.length && !g.blocked && (
            <div className="chips">
              {blockers.map((f) => (
                <span key={f} className="chip warn">{FEATURE[f] ?? f}</span>
              ))}
            </div>
          )}
        </div>

        <section className="facts">
          <h2>Technical details</h2>
          <table>
            <tbody>
              <Row k="MCP URL" v={<code>{g.mcp_url}</code>} />
              {SHOW_SIGN_IN_DETAILS && g.landing && <Row k="First screen" v={`${LANDING[g.landing.type] ?? g.landing.type} at ${g.landing.host}`} />}
              {o?.authorization_server && <Row k="Authorization server" v={<code>{o.authorization_server}</code>} />}
              {g.landing?.idp && <Row k="Identity provider" v={g.landing.idp} />}
              {SHOW_SIGN_IN_DETAILS && !!g.landing?.methods?.length && <Row k="Sign-in options" v={g.landing.methods.map((m) => METHOD[m] ?? m).join(', ')} />}
              {o && <Row k="Dynamic registration" v={<YesNo b={o.dcr} />} />}
              {o && <Row k="Client ID metadata docs" v={<YesNo b={o.cimd} />} />}
              {!!o?.pkce?.length && <Row k="PKCE" v={o.pkce.join(', ')} />}
              {!!o?.scopes?.length && <Row k="Scopes requested" v={o.scopes.map((s) => <code key={s}>{s}</code>)} />}
              {g.landing && <Row k="Redirects" v={String(g.landing.hops)} />}
              {!!g.tool_count && <Row k="Tools" v={String(g.tool_count)} />}
              {g.author && <Row k="Author" v={g.author} />}
              <Row
                k="Listed in"
                v={g.sources.map((s, i) => (
                  <span key={s}>
                    {i > 0 && ', '}
                    {s === 'connector-directory' ? (g.directory_url ? <a href={g.directory_url}>Connector directory</a> : 'Connector directory') : 'Plugin marketplace'}
                  </span>
                ))}
              />
              {g.scanned_at && <Row k="Captured" v={g.scanned_at.slice(0, 10)} />}
              <Row k="For agents" v={<><a href={`/api/gateways/${g.id}`}>JSON</a> · <a href={`/api/gateways/${g.id}?format=md`}>Markdown</a></>} />
            </tbody>
          </table>
          {SHOW_SIGN_IN_DETAILS && g.flow && g.review?.notes && <p className="note" style={{ marginTop: 12 }}><span>First screen: </span>{g.review.notes}</p>}
          {SHOW_SIGN_IN_DETAILS && g.landing?.text_excerpt && <pre>{g.landing.text_excerpt}</pre>}
        </section>
      </div>

      <Pager prev={prev} next={next} position={position} count={count} />
    </main>
  )
}

type Peer = { id: string; name: string; img: string | null } | null

// Warm the cache for an image and decode it, so it paints the moment it is shown.
const warm = (src?: string | null) => {
  if (!src || typeof window === 'undefined') return
  const img = new Image()
  img.decoding = 'async'
  // the same file the <picture> will choose in any current browser
  img.src = /\.webp(\?|$)/.test(src) ? avif(src) : src
  img.decode?.().catch(() => {})
}

// Arrow glyph for the key hints: an SVG reads clearly at small sizes in any font.
function ArrowKey({ dir }: { dir: 'left' | 'right' }) {
  return (
    <kbd aria-hidden="true" className="kbd-arrow">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        {dir === 'left' ? (
          <path d="M10 6H2.5M5.5 2.5 2 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M2 6h7.5M6.5 2.5 10 6 6.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </kbd>
  )
}

// Fixed bottom bar: previous / next gateway, also on the ← and → keys.
// Gateway-to-gateway navigation runs as a view transition: logo, title, description and the
// browser frame each blur across (styles.css, "Page transitions"); the type sets the direction.
// Phones and touch screens get no transition: the page just changes (it looked muddy there).
const NO_TRANSITION = '(max-width: 760px), (pointer: coarse)'
const slide = (dir: 'next' | 'prev') => ({
  types: () => (typeof window !== 'undefined' && window.matchMedia(NO_TRANSITION).matches ? (false as const) : [`gw-${dir}`]),
})

function Pager({ prev, next, position, count }: { prev: Peer; next: Peer; position: number; count: number }) {
  const navigate = useNavigate()
  const router = useRouter()
  useEffect(() => {
    for (const p of [next, prev]) {
      if (!p) continue
      warm(p.img)
      router.preloadRoute({ to: '/g/$id', params: { id: p.id } }).catch(() => {})
    }
  }, [prev, next, router])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : null
      if (!to) return
      e.preventDefault()
      navigate({ to: '/g/$id', params: { id: to.id }, viewTransition: slide(to === next ? 'next' : 'prev') })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, navigate])

  return (
    <nav className="pagerbar" aria-label="Gateways">
      <div className="wrap">
      {prev ? (
        <Link to="/g/$id" params={{ id: prev.id }} className="pb-btn" rel="prev" viewTransition={slide('prev')}>
          <ArrowKey dir="left" />
          <span className="pb-name">{prev.name}</span>
        </Link>
      ) : (
        <span className="pb-btn pb-off" aria-hidden="true">
          <ArrowKey dir="left" />
        </span>
      )}
      <span className="pb-pos">
        {position} / {count}
      </span>
      {next ? (
        <Link to="/g/$id" params={{ id: next.id }} className="pb-btn pb-next" rel="next" viewTransition={slide('next')}>
          <span className="pb-name">{next.name}</span>
          <ArrowKey dir="right" />
        </Link>
      ) : (
        <span className="pb-btn pb-next pb-off" aria-hidden="true">
          <ArrowKey dir="right" />
        </span>
      )}
      </div>
    </nav>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <tr>
      <th>{k}</th>
      <td>{v}</td>
    </tr>
  )
}

function YesNo({ b }: { b?: boolean }) {
  return b ? <span className="ok">Yes</span> : <span className="no">No</span>
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(m.matches)
    const on = () => setReduced(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduced
}

function Viewer({ g }: { g: Gateway }) {
  const flow = g.flow
  const gateway = flow?.steps.filter((x) => x.kind === 'gateway') ?? []
  const journey = flow?.steps ?? []
  const themes = THEMES.filter(([k]) => g.shots?.[k])
  const allModes: [Mode, string][] = [
    ...(gateway.length ? ([['gateway', `Gateway (${gateway.length})`]] as [Mode, string][]) : []),
    ...(journey.length > gateway.length ? ([['journey', `Full journey (${journey.length})`]] as [Mode, string][]) : []),
    ...(g.shots ? ([['before', 'Before sign-in']] as [Mode, string][]) : []),
  ]
  const modes = SHOW_SIGN_IN_DETAILS ? allModes : allModes.slice(0, 1)
  useEffect(() => {
    for (const st of gateway) warm(st.full ?? st.src)
  }, [g.id])
  const [mode, setMode] = useState<Mode>(modes[0]?.[0] ?? 'before')
  const [theme, setTheme] = useState<Theme>('light')
  const [i, setI] = useState(0)
  const reducedMotion = useReducedMotion()

  if (!modes.length) {
    return (
      <section className="empty">
        <p>{STATUS[g.status] ?? g.status}: there is no screen to capture before signing in.</p>
      </section>
    )
  }

  // a flow video replaces the screenshots on the page
  const flowVideo = mode !== 'before' ? flow?.video ?? null : null
  const list: FlowStep[] = flowVideo ? [] : mode === 'gateway' ? gateway : mode === 'journey' ? journey : []
  const step = list[Math.min(i, list.length - 1)]
  void KIND
  const t = themes.some(([k]) => k === theme) ? theme : 'light'
  // when a full-page capture exists, show it in a viewport-sized frame that scrolls like the page
  const scroll = mode !== 'before' && !!step?.full
  const src = mode === 'before' ? g.shots?.[t] : step?.full ?? step?.src
  const url = mode === 'before' ? g.landing?.final_url : flowVideo ? gateway[0]?.where : step?.where
  const pick = (m: Mode) => { setMode(m); setI(0) }

  return (
    <section className="viewer">
      <div className="viewer-bar">
        {modes.length > 1 && (
          <div className="seg" role="tablist" aria-label="View">
            {modes.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={mode === k} onClick={() => pick(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {SHOW_SIGN_IN_DETAILS && mode === 'before' && themes.length > 1 && (
          <div className="seg small" role="tablist" aria-label="Theme">
            {themes.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={t === k} onClick={() => setTheme(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="browser">
        <div className="bar">
          <i />
          <i />
          <i />
          <span className="url">{url}</span>
        </div>
        <div className="stage">
          {flowVideo && (
            <div className="shot">
              <video
                key={flowVideo.src}
                src={flowVideo.src}
                poster={flowVideo.poster}
                width={2880}
                height={1800}
                muted
                loop
                playsInline
                autoPlay={!reducedMotion}
                preload="auto"
                aria-label={`${g.name}: video of the authorization flow`}
              />
            </div>
          )}
          {!flowVideo && src && (
            <div key={src} className={`shot ${mode === 'before' ? t : ''}${scroll ? ' scroll' : ''}`} tabIndex={scroll ? 0 : undefined} aria-label={scroll ? 'Scrollable page preview' : undefined}>
              {mode !== 'before' && step?.video ? (
                // recorded video of this screen: loops silently like a GIF, no controls; the still is its poster
                // (with reduced motion it stays on the poster)
                <video
                  key={step.video}
                  src={step.video}
                  poster={src}
                  width={2880}
                  height={1800}
                  muted
                  loop
                  playsInline
                  autoPlay={!reducedMotion}
                  preload="auto"
                  aria-label={`${g.name}: ${step.caption ?? 'video of this step'}`}
                />
              ) : (
                <Pic
                  src={src}
                  width={2880}
                  height={1800}
                  decoding="async"
                  fetchPriority="high"
                  alt={`${g.name}: ${mode === 'before' ? 'first screen before sign-in' : step?.caption ?? 'step'}`}
                />
              )}
            </div>
          )}
          {mode !== 'before' && list.length > 1 && (
            <>
              <span className="stage-badge">{i + 1}/{list.length}</span>
              <button className="stage-nav prev" aria-label="Previous screen" disabled={i === 0} onClick={() => setI(i - 1)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button className="stage-nav next" aria-label="Next screen" disabled={i === list.length - 1} onClick={() => setI(i + 1)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <div className="stage-dots" role="tablist" aria-label="Screens">
                {list.map((s, k) => (
                  <button key={s.n} role="tab" aria-selected={k === i} aria-label={`Screen ${k + 1}: ${s.caption ?? ''}`} onClick={() => setI(k)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {/* step captions stay in the image alt text and the API; under the frame they were more noise than help */}
      {SHOW_SIGN_IN_DETAILS && mode !== 'before' && step?.caption && (
        <p className="step-cap">
          {mode === 'journey' && <em className={`kind k-${step.kind}`}>{KIND[step.kind]}</em>}
          <b>Step {list.indexOf(step) + 1}.</b> {step.caption.replace(/^step \d+\s*[:.]\s*/i, '')}
        </p>
      )}
      {SHOW_SIGN_IN_DETAILS && mode === 'before' && <p className="step-cap">The first screen a signed-out user sees after clicking Connect.</p>}
    </section>
  )
}

const CRITERIA: [keyof NonNullable<Score['criteria']>, string, Record<string, [string, 'good' | 'meh' | 'bad']>][] = [
  ['account', 'Account', { picker: ['Picker', 'good'], shown: ['Shown', 'good'], none: ['Not shown', 'bad'] }],
  ['permissions', 'Permissions', { configurable: ['Configurable', 'good'], list: ['Listed', 'good'], summary: ['Summary only', 'meh'], none: ['Not shown', 'bad'] }],
  ['redirect', 'Redirect URL', { shown: ['Shown', 'good'], warning_only: ['Warning only', 'meh'], none: ['Not shown', 'bad'] }],
  ['client_identity', 'Requesting app', { name_and_logo: ['Name and logo', 'good'], name: ['Name', 'meh'], none: ['Not shown', 'bad'] }],
  ['ui', 'UI flow', { polished: ['Polished', 'good'], ok: ['OK', 'meh'], weak: ['Weak', 'bad'], broken: ['Broken', 'bad'] }],
  ['brand', 'Brand', { strong: ['Strong', 'good'], ok: ['OK', 'meh'], weak: ['Weak', 'bad'] }],
]

function ScoreBox({ score }: { score: Score }) {
  const rows = CRITERIA.map(([k, label, map]) => {
    const v = score.criteria?.[k]
    return v && map[v] ? { label, text: map[v][0], tone: map[v][1] } : null
  }).filter((x): x is { label: string; text: string; tone: 'good' | 'meh' | 'bad' } => !!x)
  return (
    <>
      <h2>Verdict</h2>
      <div className={`score-line${score.by === 'tester' ? ' by-tester' : ''}`}>
        <b>{score.value.toFixed(1)}</b>
        <span>/ 5 · {score.by === 'tester' ? 'tester’s score' : 'estimated with the tester’s criteria'}</span>
      </div>
      {score.reason && <p>{score.reason}</p>}
      {rows.length > 0 && (
        <dl className="criteria">
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'contents' }}>
              <dt>{r.label}</dt>
              <dd className={r.tone}>{r.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

// Local-only notes box (npm run dev). Saves to data/raw/feedback.json through the dev server.
function FeedbackBox({ id }: { id: string }) {
  const [note, setNote] = useState('')
  const [state, setState] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setState('loading')
    fetch(`/__feedback?id=${id}`)
      .then((r) => r.json())
      .then((d) => { setNote(d?.note ?? ''); setState('idle') })
      .catch(() => setState('error'))
  }, [id])

  const save = (value: string) => {
    setState('saving')
    fetch(`/__feedback?id=${id}`, { method: 'POST', body: JSON.stringify({ note: value }) })
      .then((r) => (r.ok ? setState('saved') : setState('error')))
      .catch(() => setState('error'))
  }
  const onChange = (value: string) => {
    setNote(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(value), 600)
  }

  return (
    <section className="feedback">
      <label htmlFor="feedback-note">
        Your feedback <span>local only · saved to data/raw/feedback.json</span>
      </label>
      <textarea
        id="feedback-note"
        rows={3}
        placeholder="What should change for this gateway? Wrong screens, missing steps, notes to fix, hide it…"
        value={note}
        disabled={state === 'loading'}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={`feedback-state s-${state}`}>
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Could not save (is npm run dev running?)' : ''}
      </span>
    </section>
  )
}

function AfterSignIn({ flow, blocked, verdict }: { flow: Flow; blocked: string | null; verdict: Verdict | null }) {
  const status = blocked
    ? `Could not be recorded past sign-in. ${blocked}`
    : !flow.complete
      ? 'Not recorded past sign-in yet.'
      : flow.gateway_count
        ? null
        : flow.returned_to_client
          ? 'Sends the browser straight back to the client without a consent screen.'
          : 'No gateway screen after sign-in.'
  const redirect = verdict?.redirect_after_onboarding
  return (
    <>
      <h2>{SHOW_SIGN_IN_DETAILS ? 'After sign-in' : 'Flow'}</h2>
      {status && <p>{status}</p>}
      {SHOW_SIGN_IN_DETAILS && flow.summary && <p>{flow.summary}</p>}
      {(redirect || flow.features.length > 0) && (
        <div className="chips">
          {redirect && (
            <span className={`chip ${redirect === 'kept' ? 'good' : 'warn'}`}>
              {redirect === 'kept' ? 'Returns to the authorization after onboarding' : 'Loses the authorization after onboarding'}
            </span>
          )}
          {flow.features
            .filter((f) => !['redirect_kept', 'redirect_lost'].includes(f))
            .map((f) => (
              <span key={f} className={`chip${/required|blocked|error/.test(f) ? ' warn' : ''}`}>{FEATURE[f] ?? f}</span>
            ))}
        </div>
      )}
      {import.meta.env.DEV && (verdict?.ui_feedback || flow.note) && (
        <p className="note">
          <span>Tester: </span>“{verdict?.ui_feedback || flow.note}”
        </p>
      )}
    </>
  )
}
