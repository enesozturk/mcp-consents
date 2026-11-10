#!/usr/bin/env node
// Short product descriptions for gateway pages. For each gateway it fetches the provider's own site
// and reads its meta description (og:description, then description); long ones are cut at a
// sentence boundary. Fallbacks: the connector directory's one-liner, then the first sentence of the
// existing description. The site's og:site_name / title also fixes the brand's capitalisation
// when it only differs in case (Cockroachdb -> CockroachDB).
//
// Writes data/descriptions.json: { id: { text, source, url, name? } }. Entries already present are
// kept unless --force. Usage: NODE_USE_ENV_PROXY=1 node scripts/fetch-descriptions.cjs [--force]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data/descriptions.json');
const MAX = 160;
const FORCE = process.argv.includes('--force');

const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/gateways.json'), 'utf8'));
const hidden = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hidden.json'), 'utf8'));
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function shorten(t) {
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX) return t;
  // cut at the last sentence end (". " / "! " / "? ") that fits, never inside "Next.js"
  let end = -1;
  for (const m of t.matchAll(/[.!?](?=\s|$)/g)) { if (m.index + 1 <= MAX) end = m.index + 1; else break; }
  if (end >= 40) return t.slice(0, end);
  const cut = t.slice(0, MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s—-]+$/, '')}…`;
}

const registrable = (host) => {
  const p = host.split('.');
  const two = ['co.uk', 'com.au', 'com.br', 'co.jp'];
  return two.includes(p.slice(-2).join('.')) ? p.slice(-3).join('.') : p.slice(-2).join('.');
};

function siteUrls(g) {
  const urls = [];
  const bad = /github\.com|githubusercontent|npmjs|gitlab\.com\/[^/]+\/|example|localhost/;
  if (g.homepage && !bad.test(g.homepage)) urls.push(g.homepage);
  try { urls.push(`https://${registrable(new URL(g.mcp_url).host)}/`); } catch {}
  try { if (g.landing?.host) urls.push(`https://${registrable(g.landing.host)}/`); } catch {}
  return [...new Set(urls)];
}

async function fetchMeta(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; mcp-consents/0.1; +https://consents.ozturkenes.com)', accept: 'text/html' } });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('html')) return null;
    const html = (await r.text()).slice(0, 300000);
    const meta = (attr, name) => {
      const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*>`, 'i');
      const tag = html.match(re)?.[0];
      return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] || '') : '';
    };
    const desc = meta('property', 'og:description') || meta('name', 'description') || meta('name', 'twitter:description');
    const site = meta('property', 'og:site_name');
    const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '');
    return { desc, site, title, url: r.url };
  } catch { return null; }
}

// Accept a meta description only if it reads like a description of the product.
const usable = (d) => d && d.length >= 30 && !/^(just a moment|access denied|attention required|403|404|sign in|log in)/i.test(d);

function fixName(name, meta) {
  const cands = [meta?.site, ...(meta?.title || '').split(/\s[|–—-]\s/)].filter(Boolean).map((s) => s.trim());
  return cands.find((c) => c.toLowerCase() === name.toLowerCase() && c !== name) || null;
}

(async () => {
  const todo = all.filter((g) => !hidden[g.id] && (FORCE || !out[g.id]));
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < todo.length) {
      const g = todo[i++];
      let entry = null, meta = null;
      for (const u of siteUrls(g)) {
        meta = await fetchMeta(u);
        if (usable(meta?.desc)) { entry = { text: shorten(meta.desc), source: 'meta', url: meta.url }; break; }
      }
      if (!entry && g.one_liner) entry = { text: shorten(g.one_liner), source: 'one_liner' };
      if (!entry && g.description) entry = { text: shorten(g.description), source: 'shortened' };
      if (!entry) continue;
      const name = fixName(g.name, meta);
      if (name) entry.name = name;
      out[g.id] = entry;
      done++;
      if (done % 25 === 0) console.log(`${done}/${todo.length}`);
    }
  }));
  fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
  const src = Object.values(out).reduce((m, e) => ((m[e.source] = (m[e.source] || 0) + 1), m), {});
  console.log('done', Object.keys(out).length, src, 'names fixed', Object.values(out).filter((e) => e.name).length);
})();
