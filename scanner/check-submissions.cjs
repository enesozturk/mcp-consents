#!/usr/bin/env node
// Checks catalog/extra.json, the list of MCP servers added by hand or submitted in pull requests.
//   node scanner/check-submissions.cjs           format checks only
//   node scanner/check-submissions.cjs --probe   also asks each new server for its OAuth metadata
// The probe reads public metadata only; it does not register a client or open a browser.
const fs = require('fs');
const path = require('path');
const { discover } = require('./lib/oauth.cjs');

const ROOT = path.resolve(__dirname, '..');
const EXTRA = path.join(ROOT, 'catalog/extra.json');
const PUBLISHED = path.join(ROOT, 'src/data/gateways.json');
const probe = process.argv.includes('--probe');

const REQUIRED = { id: 'string', name: 'string', mcp_url: 'string', homepage: 'string', description: 'string' };
const ALLOWED = new Set([...Object.keys(REQUIRED), 'transport', 'one_liner', 'author', 'docs', 'directory_url', 'permissions',
  'is_authless', 'has_mcp_app', 'tool_count', 'tools', 'required_fields', 'templated', 'plugins', 'sources', 'submitted_by']);
const norm = (u) => { try { const x = new URL(u); return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return u; } };
const https = (u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

const errors = [];
const fail = (id, msg) => errors.push(`${id}: ${msg}`);

let extra;
try {
  extra = JSON.parse(fs.readFileSync(EXTRA, 'utf8'));
} catch (e) {
  console.error(`catalog/extra.json is not valid JSON: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(extra)) { console.error('catalog/extra.json must be a JSON array'); process.exit(1); }

const servers = fs.existsSync(path.join(ROOT, 'catalog/servers.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog/servers.json'), 'utf8')) : [];
const published = fs.existsSync(PUBLISHED) ? JSON.parse(fs.readFileSync(PUBLISHED, 'utf8')) : [];
const publishedIds = new Set(published.map((g) => g.id));

const seenIds = new Set(); const seenUrls = new Set();
for (const [i, e] of extra.entries()) {
  const id = e?.id || `entry ${i + 1}`;
  for (const [k, t] of Object.entries(REQUIRED)) if (typeof e?.[k] !== t || !e[k].trim()) fail(id, `"${k}" is required`);
  for (const k of Object.keys(e || {})) if (!ALLOWED.has(k)) fail(id, `unknown field "${k}"`);
  if (e?.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) fail(id, 'id must be lowercase letters, digits and dashes (e.g. "acme-crm")');
  if (seenIds.has(e?.id)) fail(id, 'duplicate id');
  seenIds.add(e?.id);
  if (e?.mcp_url && !https(e.mcp_url)) fail(id, 'mcp_url must be an https:// URL');
  if (e?.homepage && !https(e.homepage)) fail(id, 'homepage must be an https:// URL');
  if (e?.mcp_url && /\{|\$\{/.test(e.mcp_url)) fail(id, 'mcp_url must be a real URL, not a template');
  if (e?.mcp_url) {
    const key = norm(e.mcp_url);
    if (seenUrls.has(key)) fail(id, 'the same mcp_url is listed twice');
    seenUrls.add(key);
    const other = servers.find((s) => norm(s.mcp_url) === key && s.id !== e.id && !(s.sources || []).includes('added-by-hand'));
    if (other) fail(id, `already in the gallery as "${other.id}"`);
  }
  if (typeof e?.description === 'string' && e.description.length > 300) fail(id, 'description: keep it under 300 characters');
}

(async () => {
  if (probe && !errors.length) {
    const fresh = extra.filter((e) => !publishedIds.has(e.id));
    for (const e of fresh) {
      const r = await discover(e, { register: false });
      const line = `${e.id}: ${r.stage} (probe HTTP ${r.probe?.status || r.probe?.error || '?'})`;
      if (r.stage === 'oauth_found' || r.stage === 'cimd_only') console.log(`ok   ${line}`);
      else if (r.stage === 'authless') fail(e.id, 'the server answers without sign-in, so there is no gateway screen to show');
      else fail(e.id, `no OAuth sign-in found (${r.stage}); the gallery needs a server that uses MCP OAuth`);
    }
    if (!fresh.length) console.log('no new servers to probe');
  }
  if (errors.length) {
    console.error(`\n${errors.length} problem(s) in catalog/extra.json:\n` + errors.map((x) => `  - ${x}`).join('\n'));
    process.exit(1);
  }
  console.log(`catalog/extra.json: ${extra.length} server(s), all fine`);
})();
