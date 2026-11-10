import { Link, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // never show stack traces or internal messages to visitors
    defaultErrorComponent: ({ error }) => (
      <main className="wrap prose">
        <h1>Something went wrong</h1>
        <p>This page could not be loaded. Try again, or go back to <Link to="/">all gateways</Link>.</p>
        {import.meta.env.DEV && <pre>{String((error as Error)?.stack ?? error)}</pre>}
      </main>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
