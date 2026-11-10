#!/usr/bin/env node
// Pulls the Claude connector directory (commercial) from Anthropic's MCP registry API.
// Usage: node catalog-connectors.cjs <out.json>
const fs = require('fs');
const OUT = process.argv[2];
const BASE = 'https://api.anthropic.com/mcp-registry/v0/servers';

(async () => {
  const all = [];
  let cursor = null, pages = 0;
  do {
    const u = new URL(BASE);
    u.searchParams.set('visibility', 'commercial');
    u.searchParams.set('version', 'latest');
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    all.push(...(j.servers || []));
    cursor = j.metadata?.nextCursor || j.metadata?.next_cursor || null;
    pages++;
  } while (cursor && pages < 100);
  fs.writeFileSync(OUT.replace(/\.json$/, '.raw.json'), JSON.stringify(all, null, 1));
  const out = [];
  for (const e of all) {
    const s = e.server || e;
    const meta = e._meta || {};
    const remotes = (s.remotes || []).filter((r) => r.url);
    remotes.forEach((rm, idx) => {
      const slug = (s.title || s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.push({
        id: remotes.length > 1 ? `${slug}--${idx + 1}` : slug,
        name: s.title || s.name, registry_name: s.name, mcp_url: rm.url, transport: rm.type,
        templated: /\{|\$\{|localhost/.test(rm.url), has_static_headers: !!(rm.headers && rm.headers.length),
        description: s.description, homepage: s.websiteUrl || null, repo: s.repository?.url || null,
        anthropic_meta: Object.fromEntries(Object.entries(meta).filter(([k]) => !k.startsWith('io.modelcontextprotocol.registry'))),
        sources: ['connector-directory'],
      });
    });
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`registry entries: ${all.length}, remote endpoints: ${out.length}, pages: ${pages}`);
})();
