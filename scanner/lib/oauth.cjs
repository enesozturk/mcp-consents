// Shared MCP OAuth discovery: probe -> protected resource metadata -> AS metadata -> DCR -> PKCE authorize URL.
const crypto = require('crypto');

const CLIENT_NAME = 'MCP Consents';
const REDIRECT_URI = 'http://localhost:33418/callback';
const UA_FETCH = 'mcp-consents/0.1';
const TIMEOUT = 15000;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function http(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, redirect: 'follow', signal: ctrl.signal,
      headers: { 'user-agent': UA_FETCH, ...(opts.headers || {}) } });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: Object.fromEntries(res.headers), text: text.slice(0, 4000), json, url: res.url };
  } catch (e) {
    return { status: 0, error: String(e.cause?.code || e.message || e) };
  } finally { clearTimeout(t); }
}

function wellKnownCandidates(base, suffix) {
  const u = new URL(base);
  const p = u.pathname.replace(/\/$/, '');
  const out = [];
  if (p && p !== '/') out.push(`${u.origin}/.well-known/${suffix}${p}`);
  out.push(`${u.origin}/.well-known/${suffix}`);
  if (p && p !== '/') out.push(`${u.origin}${p}/.well-known/${suffix}`);
  return [...new Set(out)];
}

// opts.register = false stops after the metadata (no client registration), for submission checks.
async function discover(server, opts = {}) {
  const log = [];
  const r = { mcp_url: server.mcp_url };
  // 1. probe
  const probe = await http(server.mcp_url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: CLIENT_NAME, version: '0.1' } } }),
  });
  r.probe = { status: probe.status, www_authenticate: probe.headers?.['www-authenticate'] || null, error: probe.error };
  log.push(`probe ${probe.status}`);
  if (probe.status && probe.status !== 401 && probe.status !== 403) {
    r.authless = probe.status >= 200 && probe.status < 300;
  }
  // 2. protected resource metadata
  let prmUrls = [];
  const m = /resource_metadata="?([^",\s]+)"?/i.exec(r.probe.www_authenticate || '');
  if (m) prmUrls.push(m[1]);
  prmUrls.push(...wellKnownCandidates(server.mcp_url, 'oauth-protected-resource'));
  for (const u of [...new Set(prmUrls)]) {
    const res = await http(u);
    if (res.status === 200 && res.json?.authorization_servers) { r.prm = res.json; r.prm_url = u; break; }
  }
  // 3. authorization server metadata
  const asBases = r.prm?.authorization_servers?.length ? r.prm.authorization_servers : [new URL(server.mcp_url).origin];
  for (const as of asBases) {
    const cands = [...wellKnownCandidates(as, 'oauth-authorization-server'), ...wellKnownCandidates(as, 'openid-configuration')];
    for (const u of cands) {
      const res = await http(u);
      if (res.status === 200 && res.json?.authorization_endpoint) { r.asm = res.json; r.asm_url = u; break; }
    }
    if (r.asm) break;
  }
  if (!r.asm) { r.stage = r.authless ? 'authless' : 'no_oauth_metadata'; return r; }
  if (opts.register === false) {
    r.stage = r.asm.registration_endpoint ? 'oauth_found' : r.asm.client_id_metadata_document_supported ? 'cimd_only' : 'no_registration';
    return r;
  }
  // 4. dynamic client registration
  const scopes = r.prm?.scopes_supported || r.asm.scopes_supported || [];
  if (r.asm.registration_endpoint) {
    const reg = await http(r.asm.registration_endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: CLIENT_NAME, redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        token_endpoint_auth_method: 'none', client_uri: 'https://consents.ozturkenes.com',
      }),
    });
    r.dcr = { status: reg.status, client_id: reg.json?.client_id || null, error: reg.json?.error_description || reg.json?.error || reg.error || (reg.json ? null : reg.text.slice(0, 300)) };
  } else {
    r.dcr = { status: null, client_id: null, error: 'no registration_endpoint' };
  }
  if (!r.dcr.client_id) {
    r.stage = r.asm.client_id_metadata_document_supported ? 'cimd_only' : 'dcr_failed';
    return r;
  }
  // 5. authorize URL
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const au = new URL(r.asm.authorization_endpoint);
  au.searchParams.set('response_type', 'code');
  au.searchParams.set('client_id', r.dcr.client_id);
  au.searchParams.set('redirect_uri', REDIRECT_URI);
  au.searchParams.set('code_challenge', challenge);
  au.searchParams.set('code_challenge_method', 'S256');
  au.searchParams.set('state', b64url(crypto.randomBytes(12)));
  if (scopes.length) au.searchParams.set('scope', scopes.join(' '));
  au.searchParams.set('resource', r.prm?.resource || server.mcp_url);
  r.authorize_url = au.toString();
  r.scopes_requested = scopes;
  r.stage = 'authorize_ready';
  return r;
}

module.exports = { discover, http, CLIENT_NAME, REDIRECT_URI };
