#!/usr/bin/env node
// Merges official-marketplace plugin servers, connector-directory servers and catalog/extra.json into catalog/servers.json,
// deduped by normalized MCP URL. Usage: node merge.cjs <catalogDir>
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
const official = JSON.parse(fs.readFileSync(path.join(DIR, 'official.json'), 'utf8'));
const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'connectors.raw.json'), 'utf8'));

const norm = (u) => {
  try { const x = new URL(u); return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return u; }
};
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const byKey = new Map();
for (const e of raw) {
  const s = e.server; const a = e._meta['com.anthropic.api/mcp-registry'] || {};
  for (const rm of s.remotes || []) {
    const key = norm(rm.url);
    byKey.set(key, {
      id: a.slug || slugify(a.displayName || s.title || s.name),
      name: a.displayName || s.title || s.name,
      mcp_url: rm.url,
      transport: rm.type,
      one_liner: a.oneLiner || null,
      description: s.description || null,
      author: a.author?.name || null,
      homepage: a.author?.url || s.websiteUrl || null,
      docs: a.documentation || null,
      directory_url: a.directoryUrl || null,
      permissions: a.permissions || null,
      is_authless: !!a.isAuthless,
      has_mcp_app: !!a.hasMcpApp,
      tool_count: (a.toolNames || []).length,
      tools: a.toolNames || [],
      required_fields: a.requiredFields || null,
      templated: /\{|\$\{/.test(rm.url) || !!a.urlRegex,
      plugins: [],
      sources: ['connector-directory'],
    });
  }
}
for (const p of official) {
  const key = norm(p.mcp_url);
  const plug = { name: p.name, server_name: p.server_name, repo: p.repo, category: p.category };
  if (byKey.has(key)) {
    const c = byKey.get(key);
    c.plugins.push(plug);
    if (!c.sources.includes('official-marketplace')) c.sources.push('official-marketplace');
  } else {
    byKey.set(key, {
      id: p.id, name: p.name, mcp_url: p.mcp_url, transport: p.transport,
      one_liner: null, description: p.description, author: p.author, homepage: p.homepage,
      docs: null, directory_url: null, permissions: null, is_authless: null, has_mcp_app: null,
      tool_count: null, tools: [], required_fields: null,
      templated: !!p.templated, has_static_headers: p.has_static_headers,
      plugins: [plug], sources: ['official-marketplace'],
    });
  }
}
// servers added by hand (not in the directory or the marketplace)
const extraFile = path.join(DIR, 'extra.json');
for (const e of fs.existsSync(extraFile) ? JSON.parse(fs.readFileSync(extraFile, 'utf8')) : []) {
  // submissions only need id, name, mcp_url, homepage and description; the rest gets defaults
  if (!byKey.has(norm(e.mcp_url))) byKey.set(norm(e.mcp_url), {
    transport: 'streamable-http', one_liner: null, author: e.name, docs: null, directory_url: null, permissions: null,
    is_authless: false, has_mcp_app: null, tool_count: null, tools: [], required_fields: null, templated: false,
    plugins: [], sources: ['added-by-hand'], ...e,
  });
}
// hand-added servers are always scanned
const targetsFile = path.join(DIR, 'scan-targets.json');
if (fs.existsSync(targetsFile) && fs.existsSync(extraFile)) {
  const targets = JSON.parse(fs.readFileSync(targetsFile, 'utf8'));
  const have = new Set(targets.map((t) => t.id));
  const add = JSON.parse(fs.readFileSync(extraFile, 'utf8')).filter((e) => !have.has(e.id));
  if (add.length) fs.writeFileSync(targetsFile, JSON.stringify([...targets, ...add], null, 2));
}
// unique ids
const seen = new Map();
const out = [...byKey.values()].map((s) => {
  let id = s.id; const n = seen.get(id) || 0; seen.set(id, n + 1);
  if (n) id = `${id}-${n + 1}`;
  return { ...s, id };
}).sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(DIR, 'servers.json'), JSON.stringify(out, null, 2));
const both = out.filter((s) => s.sources.length === 2).length;
console.log(`total ${out.length}; in both ${both}; templated ${out.filter((s) => s.templated).length}; authless ${out.filter((s) => s.is_authless).length}`);
