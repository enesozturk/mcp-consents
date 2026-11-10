#!/usr/bin/env node
// Derives structured, comparable facts from each scan.json.
// Usage: node analyze.cjs <catalog/servers.json> <data/raw/scans> <out data/raw/gateways.json>
const fs = require('fs');
const path = require('path');
const [CAT, SCANS, OUT] = process.argv.slice(2);
const catalog = JSON.parse(fs.readFileSync(CAT, 'utf8'));

const IDP = [
  [/auth0\.com|\.auth0\./, 'Auth0'], [/okta\.com|oktapreview/, 'Okta'], [/clerk\.|clerk\.accounts|accounts\.dev/, 'Clerk'],
  [/workos|authkit\.app/, 'WorkOS AuthKit'], [/stytch/, 'Stytch'], [/descope/, 'Descope'],
  [/amazoncognito|cognito/, 'Amazon Cognito'], [/keycloak|\/realms\//, 'Keycloak'], [/b2clogin|login\.microsoftonline/, 'Microsoft Entra'],
  [/accounts\.google\.com/, 'Google'], [/github\.com\/login/, 'GitHub'], [/fusionauth/, 'FusionAuth'],
  [/frontegg/, 'Frontegg'], [/propelauth/, 'PropelAuth'], [/kinde/, 'Kinde'], [/scalekit/, 'Scalekit'],
  [/supabase\.co\/auth/, 'Supabase Auth'], [/firebaseapp|identitytoolkit/, 'Firebase Auth'], [/zitadel/, 'Zitadel'],
  [/cloudflareaccess|workers\.dev/, 'Cloudflare'], [/stack-auth|stackframe/, 'Stack Auth'], [/logto/, 'Logto'],
];

const METHODS = [
  ['google', /continue with google|sign in with google|log in with google|\bgoogle\b/i],
  ['github', /\bgithub\b/i], ['microsoft', /\bmicrosoft\b/i], ['apple', /\bapple\b/i],
  ['sso', /\bsso\b|single sign-on|saml/i], ['passkey', /passkey/i],
  ['magic_link', /magic link|email me a (link|code)|send (me )?a (link|code)|one-time code|verification code/i],
  ['password', /password/i],
];

function landingType(r) {
  const l = r.landing; if (!l) return null;
  if (l.redirected_to_callback) return /error=/.test(l.final_url) ? 'error_redirect' : 'silent_redirect';
  const t = `${l.title}\n${l.text}`.toLowerCase();
  if (/verify you are human|security verification|just a moment|checking your browser|captcha|are you a robot|verify it's you/.test(t) && t.length < 1500) return 'bot_challenge';
  if (/invalid[_ ](request|client|redirect|scope)|redirect_uri|unauthorized_client|something went wrong|\b(400|404|500)\b.*error|error\s*:|not found/.test(t) && t.length < 1200) return 'error_page';
  const consent = /(is requesting|wants to access|would like (to )?access|requesting access|authorize|allow access|grant access|\bapprove\b|\bconsent\b)/.test(t);
  const login = /(sign in|log in|login|sign up|continue with|email address|password)/.test(t);
  if (consent && !login) return 'consent';
  if (consent && login) return 'consent_then_login';
  if (login) return 'login';
  if (t.trim().length < 20) return 'blank';
  return 'other';
}

const out = [];
for (const c of catalog) {
  const f = path.join(SCANS, c.id, 'scan.json');
  const r = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  const g = { ...c };
  delete g.tools;
  g.tools_sample = (c.tools || []).slice(0, 12);
  if (c.templated) { g.status = 'needs_instance_url'; out.push(g); continue; }
  if (!r) { g.status = 'not_scanned'; out.push(g); continue; }
  g.scanned_at = r.scanned_at;
  g.probe_status = r.probe?.status ?? null;
  g.oauth = {
    resource_metadata: !!r.prm, resource_name: r.prm?.resource_name || null,
    authorization_server: r.prm?.authorization_servers?.[0] || r.asm?.issuer || null,
    issuer: r.asm?.issuer || null,
    dcr: !!r.dcr?.client_id, dcr_error: r.dcr?.client_id ? null : r.dcr?.error || null,
    cimd: !!r.asm?.client_id_metadata_document_supported,
    pkce: r.asm?.code_challenge_methods_supported || [],
    scopes: r.scopes_requested || r.prm?.scopes_supported || r.asm?.scopes_supported || [],
    grant_types: r.asm?.grant_types_supported || [],
  };
  if (r.stage === 'authorize_ready') g.status = r.capture_error && !r.screenshots?.length ? 'capture_failed' : 'captured';
  else if (r.stage === 'authless' || (r.probe?.status >= 200 && r.probe?.status < 300)) g.status = 'authless';
  else if (r.stage === 'no_oauth_metadata') g.status = r.probe?.status === 401 || r.probe?.status === 403 ? 'non_oauth_auth' : 'unreachable';
  else g.status = r.stage;
  if (r.landing) {
    const hay = [r.landing.final_url, ...(r.landing.redirect_chain || []), g.oauth.authorization_server || ''].join(' ');
    g.landing = {
      host: r.landing.host, title: r.landing.title, final_url: r.landing.final_url.replace(/([?&](client_id|state|code_challenge|auth_id|sessionId|session|nonce)=)[^&]+/g, '$1…'),
      type: landingType(r),
      hops: (r.landing.redirect_chain || []).length,
      idp: (IDP.find(([re]) => re.test(hay)) || [])[1] || null,
      methods: METHODS.filter(([, re]) => re.test(r.landing.text)).map(([k]) => k),
      text_excerpt: r.landing.text.replace(/\s+\n/g, '\n').replace(/\n{2,}/g, '\n').slice(0, 900),
    };
    g.screenshots = r.screenshots || [];
  }
  out.push(g);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const tally = (k) => out.reduce((m, g) => { const v = k(g); if (v != null) m[v] = (m[v] || 0) + 1; return m; }, {});
console.log('status', tally((g) => g.status));
console.log('landing', tally((g) => g.landing?.type));
console.log('idp', tally((g) => g.landing?.idp));
