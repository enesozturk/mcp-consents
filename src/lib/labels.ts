export const LANDING: Record<string, string> = {
  consent: 'Consent first',
  consent_then_login: 'Consent + sign-in',
  login: 'Sign-in first',
  account_picker: 'Workspace picker',
  region_picker: 'Region picker',
  api_key_prompt: 'API key prompt',
  bot_challenge: 'Bot check',
  error_page: 'Error',
  error_redirect: 'Error',
  silent_redirect: 'Silent',
  blank: 'Blank',
  other: 'Other',
}

export const METHOD: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  github: 'GitHub',
  apple: 'Apple',
  sso: 'SSO',
  passkey: 'Passkey',
  magic_link: 'Email code / link',
  password: 'Password',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  slack: 'Slack',
  salesforce: 'Salesforce',
  gitlab: 'GitLab',
}

export const PERM: Record<string, string> = {
  none: 'No permissions shown',
  summary: 'Permission summary',
  list: 'Itemised permissions',
  toggles: 'Permission toggles',
}

export const STATUS: Record<string, string> = {
  captured: 'Captured',
  authless: 'No auth',
  non_oauth_auth: 'API key / header auth',
  dcr_failed: 'DCR refused',
  cimd_only: 'CIMD only',
  needs_instance_url: 'Per-instance URL',
  unreachable: 'Unreachable',
  capture_failed: 'Capture failed',
  no_oauth_metadata: 'No OAuth metadata',
}

export const FEATURE: Record<string, string> = {
  account_picker: 'Account picker',
  workspace_created: 'Workspace auto-created',
  onboarding: 'Onboarding',
  consent_screen: 'Consent screen',
  scope_list: 'Itemised scopes',
  permission_toggles: 'Permission choices',
  resource_picker: 'Resource picker',
  work_email_required: 'Work email required',
  phone_required: 'Phone required',
  paid_plan_required: 'Paid plan required',
  desktop_app_required: 'Desktop app required',
  signup_blocked: 'Sign-up blocked',
  error: 'Ends in error',
  no_consent: 'No consent step',
  mentions_claude: 'Mentions Claude',
  marketing_upsell: 'Upsell',
  redirect_kept: 'Returns after onboarding',
  redirect_lost: 'Loses the redirect',
}

export const KIND: Record<string, string> = {
  gateway: 'Gateway',
  login: 'Sign-in',
  onboarding: 'Onboarding',
  upsell: 'Upsell',
  redirect: 'Redirect',
}
