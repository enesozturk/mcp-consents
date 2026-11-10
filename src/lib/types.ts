export type Shots = { light: string; thumb: string; dark?: string; mobile?: string }

export type Review = {
  first_screen?: string
  sign_in_methods?: string[]
  permissions?: 'none' | 'summary' | 'list' | 'toggles'
  names_client?: boolean
  highlights?: string[]
  notes?: string
}

export type StepKind = 'gateway' | 'login' | 'onboarding' | 'upsell' | 'redirect'

export type FlowStep = { n: number; kind: StepKind; src: string; full: string | null; video?: string | null; where: string; title: string; caption: string | null; manual: boolean }

export type Flow = {
  recorded_at: string | null
  note: string | null
  steps: FlowStep[]
  hidden: number
  thumb: string | null
  /** a hand-made video of the whole flow; when present the page shows only this */
  video?: { src: string; poster: string; seconds: number } | null
  gateway_count: number
  complete: boolean
  skipped: string | null
  summary: string | null
  features: string[]
  returned_to_client: boolean
  callback_error: string | null
}

export type Score = {
  value: number
  by: 'tester' | 'estimate'
  criteria: { account?: string; permissions?: string; redirect?: string; client_identity?: string; ui?: string; brand?: string } | null
  reason: string | null
}

export type Verdict = {
  redirect_after_onboarding: 'kept' | 'lost' | null
  ui_rating: number | null
  ui_feedback: string | null
}

export type Gateway = {
  id: string
  name: string
  mcp_url: string
  one_liner?: string | null
  description?: string | null
  author?: string | null
  homepage?: string | null
  directory_url?: string | null
  permissions?: string | null
  tool_count?: number | null
  tools_sample?: string[]
  plugins?: { name: string; repo?: string | null }[]
  sources: string[]
  status: string
  scanned_at?: string
  oauth?: {
    authorization_server?: string | null
    dcr?: boolean
    dcr_error?: string | null
    cimd?: boolean
    pkce?: string[]
    scopes?: string[]
  }
  landing?: {
    host: string
    title: string
    final_url: string
    type: string
    hops: number
    idp: string | null
    methods: string[]
    text_excerpt?: string
  }
  shots: Shots | null
  review?: Review
  flow: Flow | null
  blocked: string | null
  verdict: Verdict | null
  editor_note: string | null
  short_description: string | null
  score: Score | null
  auto_notes: string[]
  favicon: string | null
  display_host: string
}

/** Fields needed to render and filter a gallery card. */
export type GatewayCard = Pick<Gateway, 'id' | 'name' | 'status' | 'favicon' | 'display_host'> & {
  thumb: string | null
  landing: string
  idp: string
  methods: string[]
  perm: string
  dcr: boolean
  steps: number
  features: string[]
  blocked: boolean
  ui_rating: number | null
  score: number | null
  score_by: 'tester' | 'estimate' | null
  redirect: 'kept' | 'lost' | null
  q: string
}
