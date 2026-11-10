#!/usr/bin/env node
// Builds catalog entries for remote MCP servers declared by plugins in the official marketplace.
// Usage: node catalog-official.cjs <marketplace.json> <localRepoRoot> <out.json>
const fs = require('fs');
const path = require('path');
const [MKT, ROOT, OUT] = process.argv.slice(2);

const mkt = JSON.parse(fs.readFileSync(MKT, 'utf8'));

function ghRaw(url, ref, p) {
  const m = /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(url);
  if (!m) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${ref || 'HEAD'}/${p ? p.replace(/^\.?\/?/, '') + '/' : ''}`;
}

async function get(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (r.status !== 200) return null;
    return await r.text();
  } catch { return null; }
}

function parseLoose(t) {
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

function extractServers(obj, bare) {
  if (!obj || typeof obj !== 'object') return {};
  if (obj.mcpServers && typeof obj.mcpServers === 'object') return obj.mcpServers;
  if (!bare) return {};
  // bare form: { name: { type/url/command } }
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v && typeof v === 'object' && (v.url || v.command)) out[k] = v;
  return out;
}

async function filesFor(p) {
  const s = p.source;
  const reads = [];
  if (typeof s === 'string') {
    const dir = path.join(ROOT, s);
    for (const f of ['.mcp.json', '.claude-plugin/plugin.json']) {
      const fp = path.join(dir, f);
      reads.push(fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null);
    }
    return { reads, repo: `https://github.com/anthropics/claude-plugins-official/tree/main/${s.replace(/^\.\//, '')}` };
  }
  let base = null, repo = null;
  if (s.source === 'github') { base = `https://raw.githubusercontent.com/${s.repo}/${s.sha || s.ref || 'HEAD'}/`; repo = `https://github.com/${s.repo}`; }
  else if (s.source === 'url' || s.source === 'git') { base = ghRaw(s.url, s.sha || s.ref); repo = s.url.replace(/\.git$/, ''); }
  else if (s.source === 'git-subdir') { base = ghRaw(s.url, s.sha || s.ref, s.path); repo = s.url.replace(/\.git$/, '') + (s.path ? `/tree/${s.ref || 'main'}/${s.path}` : ''); }
  if (!base) return { reads: [], repo, unsupported: JSON.stringify(s) };
  for (const f of ['.mcp.json', '.claude-plugin/plugin.json']) reads.push(await get(base + f));
  return { reads, repo };
}

(async () => {
  const out = [];
  const misc = { local_only: [], no_mcp: [], unsupported: [] };
  let i = 0;
  async function worker() {
    while (i < mkt.plugins.length) {
      const p = mkt.plugins[i++];
      const { reads, repo, unsupported } = await filesFor(p);
      if (unsupported) { misc.unsupported.push(p.name); continue; }
      const servers = {};
      reads.forEach((t, idx) => Object.assign(servers, extractServers(parseLoose(t), idx === 0)));
      // plugin.json may reference an mcpServers file path
      const pj = parseLoose(reads[1]);
      if (pj && typeof pj.mcpServers === 'string') misc.unsupported.push(`${p.name} (mcpServers path ${pj.mcpServers})`);
      const remotes = Object.entries(servers).filter(([, v]) => v.url);
      if (!Object.keys(servers).length) misc.no_mcp.push(p.name);
      else if (!remotes.length) misc.local_only.push(p.name);
      for (const [name, v] of remotes) {
        out.push({
          id: (remotes.length > 1 ? `${p.name}--${name}` : p.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
          name: p.name, server_name: name, mcp_url: v.url, transport: v.type || 'http',
          templated: /\$\{|localhost|127\.0\.0\.1/.test(v.url),
          has_static_headers: !!v.headers, oauth_config: v.oauth || null,
          description: p.description, author: p.author?.name || null, category: p.category || null,
          homepage: p.homepage || null, repo, sources: ['official-marketplace'],
        });
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  out.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(OUT.replace(/\.json$/, '.misc.json'), JSON.stringify(misc, null, 2));
  console.log(`remote servers: ${out.length}; local-only plugins: ${misc.local_only.length}; no MCP: ${misc.no_mcp.length}; unsupported: ${misc.unsupported.length}`);
})();
