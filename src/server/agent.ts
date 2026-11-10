// Shared, agent-facing view of the dataset: one compact public record per gateway, filtering,
// sorting and markdown rendering. Used by /api/*, /llms.txt and /llms-full.txt.
import type { Gateway } from '~/lib/types'
import { FEATURE, LANDING } from '~/lib/labels'

export const SITE = 'https://consents.ozturkenes.com'

export async function loadAll(): Promise<Gateway[]> {
  const mod = await import('~/data/gateways.json')
  return mod.default as unknown as Gateway[]
}

/** Gateways listed on the site: not blocked (blocked ones are listed only on request). */
export const listed = (all: Gateway[]) => all.filter((g) => !g.blocked)

export type PublicGateway = ReturnType<typeof toPublic>

export function toPublic(g: Gateway, origin = SITE) {
  const abs = (p?: string | null) => (p ? new URL(p, origin).toString() : null)
  const gateway = (g.flow?.steps ?? []).filter((s) => s.kind === 'gateway')
  return {
    id: g.id,
    name: g.name,
    page: `${origin}/g/${g.id}`,
    mcp_url: g.mcp_url,
    description: g.short_description ?? g.one_liner ?? null,
    score: g.score?.value ?? null,
    score_by: g.score?.by ?? null,
    criteria: g.score?.criteria ?? null,
    verdict: g.score?.reason ?? null,
    first_screen: g.landing?.type ? LANDING[g.landing.type] ?? g.landing.type : null,
    gateway_host: g.landing?.host ?? null,
    identity_provider: g.landing?.idp ?? null,
    sign_in_methods: g.landing?.methods ?? [],
    signed_in_recorded: !!g.flow?.gateway_count,
    after_sign_in: (g.flow?.features ?? []).map((f) => FEATURE[f] ?? f),
    returns_after_onboarding: g.verdict?.redirect_after_onboarding ?? null,
    summary: g.flow?.summary ?? g.review?.notes ?? null,
    oauth: g.oauth
      ? { dynamic_registration: !!g.oauth.dcr, client_id_metadata_documents: !!g.oauth.cimd, scopes: g.oauth.scopes ?? [], authorization_server: g.oauth.authorization_server ?? null }
      : null,
    images: {
      gateway: gateway.map((s) => ({ caption: s.caption, url: abs(s.src), ...(s.video ? { video: abs(s.video) } : {}) })),
      before_sign_in: abs(g.shots?.light),
      ...(g.flow?.video ? { video: abs(g.flow.video.src) } : {}),
    },
    status: g.blocked ? 'blocked' : g.status,
  }
}

// query values are short words; anything longer is cut, so a request cannot make the filter expensive
const one = (v: string | null) => v?.toLowerCase().trim().slice(0, 80) || null

/** Apply the documented query parameters (see /llms.txt). */
export function query(all: Gateway[], params: URLSearchParams) {
  let list = params.get('include_blocked') === 'true' ? all : listed(all)
  const q = one(params.get('q'))
  if (q) list = list.filter((g) => [g.name, g.one_liner, g.landing?.host, g.landing?.idp, g.author].filter(Boolean).join(' ').toLowerCase().includes(q))
  const min = params.get('min_score')
  if (min) list = list.filter((g) => (g.score?.value ?? -1) >= Number(min))
  for (const key of ['account', 'permissions', 'redirect', 'ui', 'brand'] as const) {
    const v = one(params.get(key))
    if (v) list = list.filter((g) => (g.score?.criteria?.[key] ?? '').toLowerCase() === v)
  }
  const first = one(params.get('first_screen'))
  if (first) list = list.filter((g) => g.landing?.type === first)
  if (params.get('signed_in') === 'true') list = list.filter((g) => !!g.flow?.gateway_count)
  if (params.get('scored') === 'true') list = list.filter((g) => g.score)
  const sort = one(params.get('sort')) ?? 'score'
  if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
  else list = [...list].sort((a, b) => (b.score?.value ?? -1) - (a.score?.value ?? -1) || a.name.localeCompare(b.name))
  const total = list.length
  const limit = Math.min(500, Math.max(1, Number(params.get('limit') ?? 50) || 50))
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  return { total, limit, offset, items: list.slice(offset, offset + limit) }
}

export function toMarkdown(p: PublicGateway, rank?: number) {
  const c = p.criteria ?? {}
  const lines = [
    `## ${rank ? `${rank}. ` : ''}${p.name}${p.score != null ? ` (${p.score.toFixed(1)}/5${p.score_by === 'tester' ? ', tester' : ''})` : ''}`,
    p.description ? `${p.description}` : '',
    '',
    `- Page: ${p.page}`,
    `- MCP server: ${p.mcp_url}`,
    p.first_screen ? `- First screen: ${p.first_screen}${p.gateway_host ? ` at ${p.gateway_host}` : ''}` : '',
    p.criteria
      ? `- Criteria: account ${c.account ?? '?'}, permissions ${c.permissions ?? '?'}, redirect URL ${c.redirect ?? '?'}, UI ${c.ui ?? '?'}, brand ${c.brand ?? '?'}`
      : '',
    p.after_sign_in.length ? `- After sign-in: ${p.after_sign_in.join(', ')}` : '',
    p.returns_after_onboarding ? `- After onboarding: ${p.returns_after_onboarding === 'kept' ? 'returns to the MCP authorization' : 'loses the MCP authorization request'}` : '',
    p.verdict ? `- Verdict: ${p.verdict}` : '',
    p.images.gateway[0]?.url ? `- Gateway screenshot: ${p.images.gateway[0].url}` : p.images.before_sign_in ? `- Screenshot: ${p.images.before_sign_in}` : '',
  ]
  return lines.filter((l, i) => l !== '' || i === 2).join('\n')
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
  })

export const text = (body: string, type = 'text/plain') =>
  new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' } })
