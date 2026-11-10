#!/usr/bin/env node
// Prepares app data: converts screenshots to WebP under public/shots and writes src/data/gateways.json.
// Usage: node scripts/prepare.cjs  (paths are relative to the repo root)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const P = require('./paths.cjs');
P.requirePrivate('prepare-data');
const DATA = P.RAW;
const SCANS = P.SCANS;
const NOTES = path.join(ROOT, 'data/notes');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'src/data/gateways.json');
const AUTH = P.AUTH;

const METHODS = ['google', 'microsoft', 'github', 'apple', 'sso', 'passkey', 'magic_link', 'password', 'linkedin', 'facebook', 'slack', 'salesforce', 'gitlab'];
const METHOD_LABEL = { google: 'Google', microsoft: 'Microsoft', github: 'GitHub', apple: 'Apple', sso: 'SSO', passkey: 'Passkey', magic_link: 'Email code / link', password: 'Password', linkedin: 'LinkedIn', facebook: 'Facebook', slack: 'Slack', salesforce: 'Salesforce', gitlab: 'GitLab' };

const hostOf = (u) => { try { return new URL(u).host; } catch { return String(u).replace(/^https?:\/\//, '').split('/')[0]; } };
// Favicon from the provider's registrable domain (projects.motionapp.com -> motionapp.com);
// shared hosting domains keep the full host.
const SHARED_HOSTS = /\.(workers\.dev|vercel\.app|netlify\.app|github\.io|pages\.dev|herokuapp\.com|onrender\.com|fly\.dev)$/;
const faviconOf = (u) => {
  const h = hostOf(u);
  if (/\$|\{/.test(h)) return null;
  const p = h.split('.');
  const two = ['co.uk', 'com.au', 'com.br', 'co.jp'].includes(p.slice(-2).join('.'));
  const domain = SHARED_HOSTS.test(h) ? h : p.slice(two ? -3 : -2).join('.');
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
};

async function images(g) {
  const src = path.join(SCANS, g.id);
  const out = path.join(PUBLIC, 'shots', g.id);
  const shots = {};
  const light = path.join(src, 'gateway-light.png');
  const dark = path.join(src, 'gateway-dark.png');
  const mobile = path.join(src, 'gateway-mobile.png');
  const existing = (n) => fs.existsSync(path.join(out, n));
  const conv = async (inp, name, width, q = 82) => {
    const dest = path.join(out, name);
    if (!fs.existsSync(dest)) {
      if (!fs.existsSync(inp)) return null;
      fs.mkdirSync(out, { recursive: true });
      await sharp(inp).resize({ width, withoutEnlargement: true }).webp({ quality: q }).toFile(dest);
    }
    return `/shots/${g.id}/${name}`;
  };
  if (!g.screenshots?.length && !existing('light.webp')) return null;
  shots.light = await conv(light, 'light.webp', 2880);
  shots.thumb = await conv(light, 'thumb.webp', 960, 78);
  if (shots.thumb) {
    const st = await sharp(path.join(out, 'thumb.webp')).stats();
    shots.blank = st.channels.every((c) => c.stdev < 2);
  }
  const sameAsLight = fs.existsSync(dark) && fs.existsSync(light)
    && crypto.createHash('md5').update(fs.readFileSync(dark)).digest('hex') === crypto.createHash('md5').update(fs.readFileSync(light)).digest('hex');
  if (!sameAsLight) shots.dark = await conv(dark, 'dark.webp', 2880);
  shots.mobile = await conv(mobile, 'mobile.webp', 780);
  for (const k of Object.keys(shots)) if (shots[k] === null) delete shots[k];
  return shots.light ? shots : null;
}

function autoNotes(g) {
  const n = [];
  const l = g.landing;
  if (g.status === 'authless') n.push('No authentication: the server answers MCP requests directly, so there is no gateway to show.');
  if (g.status === 'non_oauth_auth') n.push('Requires authentication but publishes no OAuth metadata. Expect an API key or a pre-configured header.');
  if (g.status === 'cimd_only') n.push('Does not allow dynamic client registration; it relies on Client ID Metadata Documents, so only clients with a hosted metadata URL (like Claude) can start the flow.');
  if (g.status === 'dcr_failed') n.push(`Dynamic client registration was refused${g.oauth?.dcr_error ? ` (“${String(g.oauth.dcr_error).slice(0, 140)}”)` : ''}. The server probably only accepts allow-listed clients.`);
  if (g.status === 'needs_instance_url') n.push('The URL is per-workspace or per-region, so you configure it with your own instance address before any gateway appears.');
  if (l && !g.review) {
    if (l.type === 'consent') n.push(`Opens directly on a consent screen hosted at ${l.host}, before any sign-in.`);
    if (l.type === 'consent_then_login') n.push(`The first screen combines the consent request with sign-in options at ${l.host}.`);
    if (l.type === 'login') n.push(`Opens on a sign-in page at ${l.host}. Account or workspace selection and permission screens appear only after signing in.`);
    if (l.type === 'error_page' || l.type === 'error_redirect') n.push('A generic client was turned away. The provider likely restricts redirect URIs or client names.');
    if (l.methods?.length) n.push(`Sign-in options visible: ${l.methods.map((m) => METHOD_LABEL[m]).join(', ')}.`);
  }
  if (l?.hops > 2) n.push(`The browser passes through ${l.hops} redirects before landing.`);
  if (l?.idp) n.push(`Authentication is handled by ${l.idp}.`);
  const sc = g.oauth?.scopes || [];
  if (sc.length > 1) n.push(`Requests ${sc.length} scopes, which suggests granular permissions on the consent step.`);
  return n;
}

// Signed-in flow recorded with scanner/record.cjs. Every step is kept and labelled with a kind
// (data/flow-kinds.json, from scripts/classify-flows.cjs); "noise" steps are not published.
// Review notes come from data/raw/flow-notes/<id>.json. Personal info is published per
// data/flow-publish.json, except phone numbers, which must be masked via data/flow-masks.json.
const FLOW_NOTES = P.FLOW_NOTES;
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const PUBLISH = readJson(path.join(ROOT, 'data/flow-publish.json'), {});
const KINDS = readJson(path.join(ROOT, 'data/flow-kinds.json'), {});
const MASKS = readJson(path.join(ROOT, 'data/flow-masks.json'), {});
const SKIP = readJson(path.join(ROOT, 'data/record-skip.json'), {});
const HIDDEN = readJson(path.join(ROOT, 'data/hidden.json'), {});
const RATINGS = fs.existsSync(P.RATINGS) ? readJson(P.RATINGS, {}) : readJson(P.RATINGS_PUBLIC, {});
// The public copy keeps what ranking needs (scores, tiebreaks, redirect answers, quick UI ratings)
// and drops the tester's notes.
if (fs.existsSync(P.RATINGS)) {
  const pub = {};
  for (const [id, r] of Object.entries(RATINGS)) {
    const keep = Object.fromEntries(Object.entries(r).filter(([k]) => ['score', 'score_by', 'tiebreak', 'redirect_after_onboarding', 'ui_rating'].includes(k)));
    if (Object.keys(keep).length) pub[id] = keep;
  }
  fs.writeFileSync(P.RATINGS_PUBLIC, JSON.stringify(pub, null, 2) + '\n');
}
const EDITOR_NOTES = readJson(path.join(ROOT, 'data/gateway-notes.json'), {});
// Short product descriptions (scripts/fetch-descriptions.cjs) with hand-written overrides.
const DESCRIPTIONS = readJson(path.join(ROOT, 'data/descriptions.json'), {});
const DESC_OVERRIDES = readJson(path.join(ROOT, 'data/description-overrides.json'), {});
const NAME_OVERRIDES = readJson(path.join(ROOT, 'data/name-overrides.json'), {});

// Tester's judgement for ranking: data/raw/ratings.json wins, then flow review tags.
// Order: data/raw/ratings.json (hand edits), then the answers saved in the recording's session.json,
// then the flow review tags.
// Gateway score (0-5): the tester's own score in data/raw/ratings.json wins; otherwise the
// estimate from data/scores/<id>.json (written by reviewers following scanner/SCORE_BRIEF.md).
const SCORES_DIR = path.join(ROOT, 'data/scores');
function scoreOf(id) {
  const est = readJson(path.join(SCORES_DIR, `${id}.json`), null);
  const r = RATINGS[id];
  if (r?.score != null) return { value: r.score, by: 'tester', criteria: est?.criteria || null, reason: est?.reason || null };
  if (est?.score != null) return { value: est.score, by: 'estimate', criteria: est.criteria || null, reason: est.reason || null };
  return null;
}

function verdictOf(id, flow, blocked) {
  if (blocked) return null; // "returned after onboarding" means nothing when no gateway was reached
  const r = RATINGS[id] || {};
  const sf = path.join(AUTH, id, 'session.json');
  const s = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
  const f = flow?.features || [];
  // The recorder asks every time; the answer only means something when sign-up/onboarding happened.
  const hadOnboarding = ['onboarding', 'workspace_created', 'redirect_kept', 'redirect_lost'].some((x) => f.includes(x));
  const redirect = hadOnboarding
    ? r.redirect_after_onboarding || s.redirect_after_onboarding
      || (f.includes('redirect_kept') ? 'kept' : f.includes('redirect_lost') ? 'lost' : null)
    : null;
  const v = { redirect_after_onboarding: redirect, ui_rating: r.ui_rating ?? s.ui_rating ?? null, ui_feedback: r.ui_feedback ?? null };
  return v.redirect_after_onboarding || v.ui_rating || v.ui_feedback ? v : null;
}
const ERROR_STEP = /error|denied|forbidden|invalid|not found|no access|blocked/i;

// "blocked": recorded signed in but never reached a working gateway screen (requires a work
// email, a paid plan, a desktop app, ends in an error, or was skipped). Listed only on request.
function blockedReason(flow) {
  if (!flow) return null;
  // listed in data/record-skip.json: shown under "could not be recorded" with that reason
  if (flow.skipped) return flow.skipped;
  const gw = flow.steps.filter((x) => x.kind === 'gateway');
  if (gw.length && gw.some((x) => !ERROR_STEP.test(x.caption || ''))) return null;
  if (!gw.length && flow.returned_to_client && !flow.callback_error) return null; // no consent at all is still a result
  if (flow.skipped) return flow.skipped;
  if (gw.length) return 'Ends in an error.';
  if (flow.callback_error) return `Sends the browser back to the client with "${flow.callback_error}" and no consent screen.`;
  return flow.note || 'Did not reach the gateway after sign-in.';
}
const allowPersonal = new Set(PUBLISH.allow_personal || []);
const hiddenPersonal = [];

// Every published signed-in screenshot first goes through the OCR-based partial mask
// (names, emails, account / workspace names keep their first letters), then the hand-placed
// masks from data/flow-masks.json (phone numbers) on top.
const { maskImage } = require('./mask-personal.cjs');
const { maskVideo } = require('./mask-video.cjs');
const maskLog = [];
async function publishImage(srcOrig, dest, masks, cacheKey) {
  const tmp = `${dest}.tmp.png`;
  const r = await maskImage(srcOrig, tmp, { cacheKey, gateway: cacheKey.split('/')[0] });
  if (r.masked) maskLog.push(`${cacheKey}: ${r.regions.map((x) => x.text).join(', ')}`);
  const src = tmp;
  if (!masks?.length) { await sharp(src).webp({ quality: 88 }).toFile(dest); fs.rmSync(tmp, { force: true }); return; }
  const img = sharp(src);
  const meta = await img.metadata();
  const parts = [];
  for (const [x, y, w, h] of masks) {
    const box = { left: Math.max(0, x), top: Math.max(0, y), width: Math.min(w, meta.width - x), height: Math.min(h, meta.height - y) };
    // pixelate, then blur: unreadable but still looks like a filled-in field
    const tiny = await sharp(src).extract(box).resize(Math.max(1, Math.round(box.width / 24)), Math.max(1, Math.round(box.height / 24))).toBuffer();
    const block = await sharp(tiny).resize(box.width, box.height, { kernel: 'nearest' }).blur(6).toBuffer();
    parts.push({ input: block, left: box.left, top: box.top });
  }
  await img.composite(parts).webp({ quality: 88 }).toFile(dest);
  fs.rmSync(tmp, { force: true });
}

async function flowOf(id) {
  const f = path.join(AUTH, id, 'session.json');
  if (!fs.existsSync(f)) {
    if (!SKIP[id]) return null;
    return { recorded_at: null, note: null, steps: [], hidden: 0, thumb: null, gateway_count: 0, complete: false,
      skipped: SKIP[id], summary: null, features: [], returned_to_client: false, callback_error: null };
  }
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const rv = readJson(path.join(FLOW_NOTES, `${id}.json`), {});
  const kinds = KINDS[id]?.kinds || {};
  const personal = rv.personal_info || {};
  const out = path.join(PUBLIC, 'auth', id);
  fs.rmSync(out, { recursive: true, force: true });
  const copy = async (name, n) => {
    if (!name || !fs.existsSync(path.join(AUTH, id, name))) return null;
    fs.mkdirSync(out, { recursive: true });
    try {
      await publishImage(path.join(AUTH, id, name), path.join(out, name), name.includes('-full') ? null : MASKS[`${id}:${n}`], `${id}/${name}`);
    } catch (e) {
      maskLog.push(`!! NOT PUBLISHED ${id}/${name}: ${e.message}`);
      return null;
    }
    return `/auth/${id}/${name}`;
  };
  let hidden = 0;
  const steps = [];
  for (const st of s.steps || []) {
    const kind = kinds[st.n] || 'gateway';
    // only the consent screens themselves are published; sign-in, onboarding and callback pages
    // are not shown anywhere and often carry more personal data
    if (kind !== 'gateway') continue;
    const info = personal[st.n] || '';
    const masked = !!MASKS[`${id}:${st.n}`];
    const allowed = allowPersonal.has(`${id}:${st.n}`) || allowPersonal.has(`${id}:*`)
      || (allowPersonal.has('*') && (!/phone/i.test(info) || masked));
    if (info && !allowed) { hidden++; hiddenPersonal.push(`${id}:${st.n} (${info})`); continue; }
    let where = st.host;
    try { const u = new URL(st.url); where = u.host + u.pathname; } catch {}
    const src = await copy(st.file, st.n);
    // a full-page capture of a masked step is not published (the mask covers the viewport only)
    // publish the full-page capture only when the page is clearly longer than the viewport
    // (the preview then scrolls); a few extra pixels are not worth a scrolling frame
    const longPage = (st.viewport?.scroll_h ?? 0) > (st.viewport?.h ?? Infinity) * 1.25;
    const full = masked || !longPage ? null : await copy(st.full_page, st.n);
    // a recorded video of this screen plays in place of the still, which stays as its poster
    let video = null;
    if (src && st.video && fs.existsSync(path.join(AUTH, id, st.video))) {
      const name = `${String(st.n).padStart(2, '0')}.mp4`;
      try {
        const r = await maskVideo(path.join(AUTH, id, st.video), path.join(out, name), { gateway: id });
        fs.rmSync(path.join(out, `${name}.webp`), { force: true });
        if (r.regions.length) maskLog.push(`${id}/${name}: ${r.regions.join(', ')} (${r.masked_frames}/${r.frames} frames)`);
        video = `/auth/${id}/${name}`;
      } catch (e) {
        maskLog.push(`!! NOT PUBLISHED ${id}/${st.video}: ${e.message.split('\n')[0]}`);
      }
    }
    if (src) steps.push({ n: steps.length + 1, kind, src, full: video ? null : full, video, where, title: st.title || '', caption: rv.captions?.[st.n] || null, manual: !!st.manual });
  }
  // A recording can come with one hand-made video of the whole flow (session.json "video"): the
  // page then shows only that video, and the screenshots stay for the card, the API and agents.
  let video = null;
  if (s.video && fs.existsSync(path.join(AUTH, id, s.video))) {
    fs.mkdirSync(out, { recursive: true });
    try {
      // optional trim in session.json: video_start / video_end in seconds
      const r = await maskVideo(path.join(AUTH, id, s.video), path.join(out, 'flow.mp4'), { gateway: id, start: s.video_start || 0, end: s.video_end ?? null });
      if (r.regions.length) maskLog.push(`${id}/flow.mp4: ${r.regions.join(', ')} (${r.masked_frames}/${r.frames} frames)`);
      fs.renameSync(path.join(out, 'flow.mp4.webp'), path.join(out, 'flow-poster.webp'));
      video = { src: `/auth/${id}/flow.mp4`, poster: `/auth/${id}/flow-poster.webp`, seconds: r.seconds };
    } catch (e) {
      maskLog.push(`!! NOT PUBLISHED ${id}/${s.video}: ${e.message.split('\n')[0]}`);
    }
  }
  const gw = steps.filter((x) => x.kind === 'gateway');
  let thumb = null;
  if (gw.length) {
    await sharp(path.join(PUBLIC, gw[0].src)).resize({ width: 960 }).webp({ quality: 78 }).toFile(path.join(out, 'thumb.webp'));
    thumb = `/auth/${id}/thumb.webp`;
  }
  if (!steps.length && !s.returned_to_client && !s.note && !rv.summary) return null;
  return {
    recorded_at: s.recorded_at, note: s.note || null, steps, hidden, thumb, video,
    skipped: SKIP[id] || null,
    gateway_count: gw.length, complete: KINDS[id] ? KINDS[id].complete : gw.length > 0 || !!s.returned_to_client,
    summary: rv.summary || null, features: rv.features || [],
    returned_to_client: !!s.returned_to_client, callback_error: s.returned_to_client?.error || null,
  };
}

(async () => {
  const all = JSON.parse(fs.readFileSync(DATA, 'utf8')).filter((g) => g.status !== 'not_scanned' && !HIDDEN[g.id]);
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < all.length) {
      const g = all[i++];
      g.shots = await images(g);
      if (g.shots?.blank) g.shots = null;
      if (/^[a-z0-9-]+$/.test(g.name)) g.name = g.name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      const nf = path.join(NOTES, `${g.id}.json`);
      if (fs.existsSync(nf)) {
        const rv = JSON.parse(fs.readFileSync(nf, 'utf8'));
        g.review = rv;
        if (g.landing && rv.first_screen) g.landing.type = rv.first_screen;
        if (g.landing && Array.isArray(rv.sign_in_methods)) g.landing.methods = rv.sign_in_methods.filter((m) => METHODS.includes(m));
      }
      g.flow = await flowOf(g.id);
      g.blocked = blockedReason(g.flow);
      g.verdict = verdictOf(g.id, g.flow, g.blocked);
      g.editor_note = EDITOR_NOTES[g.id] || null;
      g.short_description = DESC_OVERRIDES[g.id] || DESCRIPTIONS[g.id]?.text || null;
      if (DESCRIPTIONS[g.id]?.name) g.name = DESCRIPTIONS[g.id].name;
      if (NAME_OVERRIDES[g.id]) g.name = NAME_OVERRIDES[g.id];
      g.score = g.blocked ? null : scoreOf(g.id);
      g.auto_notes = autoNotes(g);
      g.favicon = faviconOf(g.mcp_url);
      g.display_host = g.landing?.host || hostOf(g.mcp_url);
      delete g.screenshots;
    }
  }));
  // Ranked: scored gateways by score (high to low), then the rest with a screenshot, then the rest.
  const tier = (g) => (g.score ? 0 : g.shots || g.flow?.thumb ? 1 : 2);
  // equal scores: the tester's `tiebreak` in data/raw/ratings.json (lower first), then the name
  const tb = (g) => RATINGS[g.id]?.tiebreak ?? 100;
  all.sort((a, b) => tier(a) - tier(b) || (b.score?.value ?? 0) - (a.score?.value ?? 0) || tb(a) - tb(b) || a.name.localeCompare(b.name));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // Same partial masking for text as for images: personal names / emails keep 3 letters.
  const terms = JSON.parse(fs.readFileSync(fs.existsSync(P.TERMS) ? P.TERMS : P.TERMS_EXAMPLE, 'utf8'));
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const textResFor = (id) => {
    const skip = new Set((terms.exempt?.[id] || []).map((x) => x.toLowerCase()));
    return [
    /[A-Za-z0-9._%+-]+@(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail)\.[a-z.]{2,}/gi,
    ...(terms.contains || []).map((t) => new RegExp(`[\\w.-]*${esc(t)}[\\w.'-]*`, 'gi')),
    ...(terms.phrases || []).filter((p) => p.length > 5 && !skip.has(p.toLowerCase())).map((p) => new RegExp(`\\b${esc(p)}\\b`, 'gi')),
  ];
  };
  const SECRET_QS = /([?&](?:[a-z_]*token|code|state|session[a-z_]*|code_challenge|client_id|nonce|auth[a-z_]*|sig|signature|ticket|otp|key|payload)=)[^&#\s"]+/gi;
  const scrub = (v, textRes) => {
    if (typeof v === 'string') return textRes.reduce((s, re) => s.replace(re, (m) => `${m.slice(0, 3)}•••`), v).replace(SECRET_QS, '$1…');
    if (Array.isArray(v)) return v.map((x) => scrub(x, textRes));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x, textRes)]));
    return v;
  };
  // The tester's own notes never go into the published data; they are kept for npm run dev in
  // src/data/dev-notes.json, which is git-ignored.
  const devNotes = {};
  for (const g of all) {
    const note = g.flow?.note || null, ui = g.verdict?.ui_feedback || null;
    if (note || ui) devNotes[g.id] = { note, ui_feedback: ui };
    if (g.flow) g.flow.note = null;
    if (g.verdict) g.verdict.ui_feedback = null;
  }
  fs.writeFileSync(path.join(path.dirname(OUT), 'dev-notes.json'), JSON.stringify(devNotes, null, 2) + '\n');
  // Published files keep their names across re-recordings, so every URL carries a short content
  // hash: an updated screenshot gets a new URL and is never served from a stale cache.
  const verCache = new Map();
  const version = (v) => {
    if (typeof v === 'string' && /^\/(auth|shots)\/[^?]+\.(webp|png|mp4)$/.test(v)) {
      if (!verCache.has(v)) {
        const f = path.join(PUBLIC, v);
        verCache.set(v, fs.existsSync(f) ? `${v}?v=${crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8)}` : v);
      }
      return verCache.get(v);
    }
    if (Array.isArray(v)) return v.map(version);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, version(x)]));
    return v;
  };
  fs.writeFileSync(OUT, JSON.stringify(all.map((g) => version(scrub(g, textResFor(g.id))))));
  // Where everything else went: the servers left out after review, grouped by reason, for the
  // "not ranked" view and the About page (src/data/summary.json).
  const groups = [
    ['work', 'needed a work email or a team account', /work email|team account/i],
    ['duplicate', 'duplicated another entry (same provider or product)', /duplicate|same gateway|same provider|same company|one entry|one mcp server|one per/i],
    ['error', 'failed with an error at sign-in', /error|403|broken|access_denied|fails at sign-in|sign-in fails/i],
    ['paid', 'needed a paid plan or an enterprise account', /paid plan|upgrade|paywall|enterprise|subscription/i],
    ['skipped', 'were skipped while recording', /skipped/i],
    ['no-consent', 'had no consent screen at all', /no consent|straight back|no gateway|without a gateway/i],
    ['phone', 'needed a phone number', /phone/i],
    ['api-key', 'asked for an API key instead of OAuth', /api key/i],
    ['desktop', 'needed a desktop app', /desktop/i],
    ['other', 'were removed after review (example servers and others)', /./],
  ];
  const counts = new Map();
  for (const [id, why] of Object.entries(HIDDEN)) {
    if (id === '_doc') continue;
    const g = groups.find(([, , re]) => re.test(String(why)));
    counts.set(g[0], (counts.get(g[0]) || 0) + 1);
  }
  const listedN = all.filter((g) => !g.blocked && g.score).length;
  const notRankedN = all.filter((g) => g.blocked).length;
  const removed = groups.filter(([k]) => counts.get(k)).map(([key, label]) => ({ key, label, count: counts.get(key) }));
  const removedN = removed.reduce((n, r) => n + r.count, 0);
  fs.writeFileSync(path.join(path.dirname(OUT), 'summary.json'), JSON.stringify({ reviewed: listedN + notRankedN + removedN, ranked: listedN, not_ranked: notRankedN, removed_total: removedN, removed }, null, 2) + '\n');

  // Folders of servers that are no longer published (hidden, or nothing left to show) are removed,
  // so their images are not served at guessable URLs.
  const keep = { auth: new Set(all.filter((g) => g.flow?.steps?.length || g.flow?.video).map((g) => g.id)), shots: new Set(all.filter((g) => g.shots).map((g) => g.id)) };
  for (const dir of ['auth', 'shots']) {
    const base = path.join(PUBLIC, dir);
    if (!fs.existsSync(base)) continue;
    for (const id of fs.readdirSync(base)) if (!keep[dir].has(id)) fs.rmSync(path.join(base, id), { recursive: true, force: true });
  }
  // An AVIF twin for every published WebP: about half the size with the same sharpness (quality 70,
  // full-resolution colour). The site serves it through <picture> with the WebP as fallback.
  // Cached by the WebP's content, so only new or changed images are encoded.
  const avifCache = path.join(P.MASK_CACHE, 'avif');
  fs.mkdirSync(avifCache, { recursive: true });
  const webps = [];
  for (const dir of ['auth', 'shots']) {
    const base = path.join(PUBLIC, dir);
    for (const id of fs.existsSync(base) ? fs.readdirSync(base) : []) {
      for (const f of fs.readdirSync(path.join(base, id))) if (f.endsWith('.webp')) webps.push(path.join(base, id, f));
    }
  }
  let encoded = 0, k = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (k < webps.length) {
      const f = webps[k++];
      const out = f.replace(/\.webp$/, '.avif');
      const hash = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
      const cached = path.join(avifCache, `${hash}.avif`);
      if (!fs.existsSync(cached)) {
        await sharp(f).avif({ quality: 70, effort: 6, chromaSubsampling: '4:4:4' }).toFile(cached);
        encoded++;
      }
      fs.copyFileSync(cached, out);
    }
  }));
  console.log(`avif: ${webps.length} image(s), ${encoded} newly encoded`);
  // Static files skip the Worker, so they get the security headers here (same values as src/server/security.ts).
  const SEC = ['Strict-Transport-Security: max-age=31536000; includeSubDomains', 'X-Content-Type-Options: nosniff',
    'X-Frame-Options: DENY', 'Referrer-Policy: strict-origin-when-cross-origin', 'Cross-Origin-Opener-Policy: same-origin',
    'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'];
  fs.writeFileSync(path.join(PUBLIC, '_headers'), [
    '/*', ...SEC.map((h) => `  ${h}`),
    '/shots/*', '  Cache-Control: public, max-age=2592000, immutable',
    // URLs carry a content hash (?v=), so both folders can be cached for good
    '/auth/*', '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(P.REPORTS, 'hidden-personal.txt'), hiddenPersonal.join('\n') + (hiddenPersonal.length ? '\n' : ''));
  if (hiddenPersonal.length) console.log(`hidden ${hiddenPersonal.length} step(s) with personal info (see data/raw/hidden-personal.txt)`);
  fs.writeFileSync(path.join(P.REPORTS, 'mask-report.txt'), maskLog.sort().join('\n') + '\n');
  console.log(`masked personal text in ${maskLog.length} image(s) (see data/raw/mask-report.txt)`);
  console.log(`blocked (listed on request): ${all.filter((g) => g.blocked).length}`);
  console.log(`prepared ${all.length} gateways, ${all.filter((g) => g.shots).length} with screenshots, ${all.filter((g) => g.flow).length} with signed-in flows`);
})();
