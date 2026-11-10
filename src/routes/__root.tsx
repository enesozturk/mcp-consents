import { useEffect, useRef, useState, type ReactNode } from 'react'
import { HeadContent, Link, Scripts, createRootRoute, useMatches, useNavigate, useRouterState } from '@tanstack/react-router'
import appCss from '~/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#ffffff' },
      { title: 'MCP Consents' },
      // share card defaults; gateway pages replace og:image with their own screen
      { property: 'og:site_name', content: 'MCP Consents' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: 'https://consents.ozturkenes.com/og.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'MCP Consents: the OAuth consent screens behind remote MCP servers, captured and ranked.' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap' },
      { rel: 'stylesheet', href: appCss },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      // agent discovery: plain-text guide and machine-readable list
      { rel: 'alternate', type: 'text/plain', href: '/llms.txt', title: 'llms.txt' },
      { rel: 'alternate', type: 'application/json', href: '/api/gateways', title: 'MCP Consents API' },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <main className="wrap prose">
      <h1>Not found</h1>
      <p>
        <Link to="/">Back to all consent screens</Link>
      </p>
    </main>
  ),
})

// Header search: always visible; typing filters the gallery (and jumps there from other pages).
// "/" focuses it from anywhere.
function HeaderSearch() {
  const navigate = useNavigate()
  const { pathname, q } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, q: (s.location.search as { q?: string }).q ?? '' }),
  })
  const [value, setValue] = useState(q)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setValue(q), [q])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== '/' || e.metaKey || e.ctrlKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const update = (v: string) => {
    setValue(v)
    navigate({ to: '/', search: (prev: Record<string, unknown>) => ({ ...(pathname === '/' ? prev : {}), q: v || undefined }), replace: pathname === '/', resetScroll: pathname !== '/' })
  }
  return (
    <div className="search">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
        <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        id="site-search"
        ref={ref}
        type="search"
        placeholder="Search consent screens"
        aria-label="Search consent screens"
        value={value}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (update(''), (e.target as HTMLInputElement).blur())}
      />
      {!value && <kbd aria-hidden="true">/</kbd>}
    </div>
  )
}

function Header() {
  return (
    <header className="top">
      <div className="wrap">
        <Link to="/" className="brand">
          MCP <b>Consents</b>
        </Link>
        <HeaderSearch />
        <nav>
          <Link to="/skill">Skill</Link>
          <Link to="/about">About</Link>
          <a className="gh" href="https://github.com/enesozturk/mcp-consents" aria-label="Source on GitHub" title="Source on GitHub">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  )
}

// Tab icon: the site's own mark, or the brand's icon while a gateway page is open.
function TabIcon() {
  const matches = useMatches()
  const gw = matches.find((m) => m.routeId === '/g/$id')?.loaderData as { gateway?: { favicon?: string | null } } | undefined
  const brand = gw?.gateway?.favicon
  return brand ? (
    <link key="brand" rel="icon" type="image/png" href={brand} />
  ) : (
    <>
      <link key="svg" rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link key="png" rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    </>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <TabIcon />
      </head>
      <body>
        <Header />
        {children}
        <footer>
          <div className="wrap">
            <span>
              Captured with a test client named “MCP Consents”. Nothing was approved. By{' '}
              <a href="https://ozturkenes.com">Enes Öztürk</a>.
            </span>
            <nav aria-label="For agents">
              <Link to="/skill">Skill</Link>
              <Link to="/about">About</Link>
              <a href="/llms.txt">llms.txt</a>
              <a href="/api/gateways">API</a>
            </nav>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  )
}
