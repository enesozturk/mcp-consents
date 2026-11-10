import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import type { Gateway, GatewayCard } from '~/lib/types'

// The dataset is imported lazily inside handlers so it stays out of the client bundle.
async function load(): Promise<Gateway[]> {
  const mod = await import('~/data/gateways.json')
  return mod.default as unknown as Gateway[]
}

type DevNotes = Record<string, { note: string | null; ui_feedback: string | null }>
async function devNotes(): Promise<DevNotes> {
  const files = import.meta.glob<{ default: DevNotes }>('../data/dev-notes.json')
  const load = Object.values(files)[0]
  return load ? (await load()).default : {}
}

export const getGallery = createServerFn({ method: 'GET' }).handler(async () => {
  const all = await load()
  const cards: GatewayCard[] = all.map((g) => ({
    id: g.id,
    name: g.name,
    status: g.status,
    favicon: g.favicon,
    display_host: g.display_host,
    thumb: g.flow?.thumb ?? g.shots?.thumb ?? null,
    landing: g.landing?.type ?? '',
    idp: g.landing?.idp ?? '',
    methods: g.landing?.methods ?? [],
    perm: g.review?.permissions ?? '',
    dcr: !!g.oauth?.dcr,
    steps: g.flow?.gateway_count ?? 0,
    features: g.flow?.features ?? [],
    blocked: !!g.blocked,
    ui_rating: g.verdict?.ui_rating ?? null,
    score: g.score?.value ?? null,
    score_by: g.score?.by ?? null,
    redirect: g.verdict?.redirect_after_onboarding ?? null,
    q: [g.name, g.author, g.one_liner, g.landing?.host, g.landing?.idp, ...(g.plugins ?? []).map((p) => p.name)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }))
  return { cards, total: all.length }
})

export const getGateway = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const all = await load()
    const gateway = all.find((g) => g.id === id)
    if (!gateway) throw notFound()
    // Step through the same set the gallery shows by default: listed gateways with a screen,
    // or, from a blocked / screenless gateway, the others of that kind.
    const group = (g: Gateway) => (g.blocked ? 'blocked' : g.score || g.flow?.thumb || g.shots?.thumb ? 'listed' : 'noscreen')
    const peers = all.filter((g) => group(g) === group(gateway))
    const i = peers.indexOf(gateway)
    // first image shown on a gateway page, so the client can preload the neighbours
    const firstImage = (g: Gateway) => g.flow?.video?.poster ?? g.flow?.steps.find((x) => x.kind === 'gateway')?.src ?? g.shots?.light ?? null
    const pick = (g?: Gateway) => (g ? { id: g.id, name: g.name, img: firstImage(g) } : null)
    // The tester's own notes are not in the published data. Under npm run dev they come from the
    // git-ignored src/data/dev-notes.json (written by prepare-data) when it exists.
    const notes = import.meta.env.DEV ? (await devNotes())[gateway.id] : undefined
    const pub: Gateway = {
      ...gateway,
      flow: gateway.flow ? { ...gateway.flow, note: notes?.note ?? null } : null,
      verdict: gateway.verdict ? { ...gateway.verdict, ui_feedback: notes?.ui_feedback ?? null } : null,
    }
    return { gateway: pub, prev: pick(peers[i - 1]), next: pick(peers[i + 1]), position: i + 1, count: peers.length }
  })
