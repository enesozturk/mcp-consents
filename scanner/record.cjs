#!/usr/bin/env node
// Records the screens behind MCP sign-in gateways in your own Chrome.
//
// You sign in by hand; the recorder opens each gateway, captures every new screen
// (account pickers, workspace selection, consent, permission toggles) and never clicks
// Approve. Captures go to data/raw/auth-scans/<id>/.
//
// Usage:
//   npm run record -- --setup                 open the recording profile to sign in to Google once
//   npm run record                            the re-record list in data/record-todo.json, or the Google queue when it is empty
//   npm run record -- --group email           other queues: google | microsoft | email | workspace | gated | consent | all
//                                             (consent = shows its own consent before sign-in; click Approve to
//                                             reach sign-in and account selection; no token is ever exchanged)
//   npm run record -- --only notion,stripe    specific gateways
//   npm run record -- --todo                  the re-record list in data/record-todo.json
//   npm run record -- --redo                  re-record gateways that already have a session
//   npm run record -- --keep-google           also capture accounts.google.com screens (hidden by default)
//   npm run record -- --chrome <path>         Chrome/Chromium binary if it is not found automatically
//
// Keys while a gateway is open:
//   Enter  finish this gateway (then answer: back to the gateway after onboarding? UI rating 1-5, note)
//   c      capture the current screen now
//   v      start / stop a video of the page area (macOS: native screen recording at 2x; elsewhere
//          a 1x screencast, needs ffmpeg). Keep 5-10 seconds; it plays as a loop on the site.
//   r      restart this gateway with a fresh authorization link
//   s      skip this gateway
//   q      save and quit
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawn, execSync } = require('child_process');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { discover, REDIRECT_URI } = require('./lib/oauth.cjs');

const ROOT = path.join(__dirname, '..');
const P = require('../scripts/paths.cjs');
const OUT = P.AUTH;
const DATA = path.join(ROOT, 'src/data/gateways.json');
const HISTORY = P.HISTORY;
const RATINGS = P.RATINGS; // tester's redirect + UI judgement, used for ranking
const SKIP = path.join(ROOT, 'data/record-skip.json'); // gateways not worth recording, with a reason
const PROFILE = path.join(os.homedir(), '.mcp-gateways', 'chrome-profile');
const PORT = 9333;
const VIEW_W = 1440; // same viewport as the unauthenticated scan
const VIEW_H = 900;

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const has = (n) => args.includes(n);
const GROUP = flag('--group', 'google');
const TODO_FILE = path.join(__dirname, '..', 'data/record-todo.json');
// The re-record list (data/record-todo.json) is the default whenever it is not empty; pass
// --group or --only to work through something else.
const TODO_IDS = fs.existsSync(TODO_FILE) ? JSON.parse(fs.readFileSync(TODO_FILE, 'utf8')).ids || [] : [];
const TODO = (has('--todo') || (!has('--group') && !has('--only') && !has('--setup'))) && TODO_IDS.length ? TODO_IDS : null;
const ONLY = TODO || (flag('--only', '') ? flag('--only').split(',') : null);
const REDO = has('--redo') || !!TODO;
const KEEP_GOOGLE = has('--keep-google');
const HEADLESS = has('--headless');        // for testing the pipeline only
const AUTO = parseInt(flag('--auto', '0'), 10); // for testing: finish each gateway after N seconds

const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m` };

// ---------- queue ----------

const GATED = /request access|contact (sales|us)|book a demo|talk to sales|enterprise|invitation|invite only|by invitation|existing customers?|subscribers?|client login|institutional/i;
const SIGN_IN_FIRST = ['login', 'consent_then_login', 'account_picker', 'region_picker'];

function groupOf(g) {
  if (g.landing?.type === 'consent') return 'consent';
  const m = g.landing?.methods || [];
  const text = `${g.review?.notes || ''} ${g.landing?.text_excerpt || ''}`;
  if (GATED.test(text) && !m.includes('google')) return 'gated';
  if (m.includes('google')) return 'google';
  if (m.includes('microsoft')) return 'microsoft';
  if (m.includes('magic_link') || m.includes('password')) return 'email';
  return 'workspace';
}

function buildQueue() {
  const all = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let q = ONLY ? ONLY.map((id) => all.find((g) => g.id === id)).filter(Boolean)
    : all.filter((g) => g.shots && (SIGN_IN_FIRST.includes(g.landing?.type) || g.landing?.type === 'consent')
      && (GROUP === 'all' || groupOf(g) === GROUP));
  // the same gateway can be listed more than once (regional or duplicate entries); record it once
  const seen = new Set();
  q = q.filter((g) => { const k = g.mcp_url.replace(/[?#].*$/, '').replace(/\/+$/, ''); if (seen.has(k)) return false; seen.add(k); return true; });
  // A gateway is asked once: any saved attempt counts as done, whatever its outcome.
  // Use --only <id> --redo to record it again.
  const skip = fs.existsSync(SKIP) ? JSON.parse(fs.readFileSync(SKIP, 'utf8')) : {};
  if (!ONLY) q = q.filter((g) => !skip[g.id]);
  const done = (g) => fs.existsSync(path.join(OUT, g.id, 'session.json'));
  return { queue: REDO || ONLY ? q : q.filter((g) => !done(g)), total: q.length, done: q.filter(done).length };
}

// ---------- browser ----------

function findChrome() {
  const explicit = flag('--chrome', '');
  if (explicit) return explicit;
  const candidates = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    win32: [path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')],
  }[process.platform] || [];
  for (const p of candidates) if (p && fs.existsSync(p)) return p;
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  }
  return null;
}

function launchChrome(debug) {
  const bin = findChrome();
  if (!bin) {
    console.error(c.red('Google Chrome was not found. Install it, or pass --chrome "<path to chrome>".'));
    process.exit(1);
  }
  fs.mkdirSync(PROFILE, { recursive: true });
  const a = [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--window-size=1440,1000'];
  if (debug) a.push(`--remote-debugging-port=${PORT}`);
  if (HEADLESS) a.push('--headless=new');
  if (process.platform === 'linux' && process.getuid?.() === 0) a.push('--no-sandbox'); // Chrome refuses to run as root otherwise
  a.push(debug ? 'about:blank' : 'https://accounts.google.com/');
  const proc = spawn(bin, a, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  proc.on('exit', (code) => { if (code && !proc.killed) console.error(c.red(`Chrome exited (${code}). Close other windows using this profile and try again.`) + c.dim(`\n${err.trim().split('\n').slice(-3).join('\n')}`)); });
  return proc;
}

async function connect() {
  const proc = launchChrome(true);
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) break;
    } catch {}
    await new Promise((res) => setTimeout(res, 250));
  }
  if (proc.exitCode !== null) process.exit(1);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  return { browser, proc, context: browser.contexts()[0] };
}

// ---------- capture helpers ----------

const SECRET_PARAM = /code|state|token|session|challenge|client_id|nonce|auth|sig|ticket|otp|key/i;
function cleanUrl(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (SECRET_PARAM.test(k)) x.searchParams.set(k, '…');
    return x.toString().replace(/%E2%80%A6/g, '…');
  } catch { return u; }
}

async function pageKey(page) {
  try {
    const text = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 4000));
    // ignore digits so clocks and countdowns do not count as a new screen
    const h = crypto.createHash('md5').update(text.replace(/\d+/g, '#')).digest('hex').slice(0, 10);
    return `${page.url().split('#')[0]}|${h}`;
  } catch { return null; }
}

function keyInput(onKey) {
  if (!process.stdin.isTTY) return () => {};
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const h = (str, key) => {
    if (key?.ctrl && key.name === 'c') return onKey('q');
    if (key?.name === 'return' || key?.name === 'enter') return onKey('enter');
    if (str) onKey(str.toLowerCase());
  };
  process.stdin.on('keypress', h);
  return () => { process.stdin.off('keypress', h); process.stdin.setRawMode(false); process.stdin.pause(); };
}

function ask(question) {
  if (!process.stdin.isTTY || AUTO) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim()); }));
}

// Resize the window so the page area is exactly VIEW_W x VIEW_H (or the largest size the screen allows).
async function fixWindow(page) {
  if (HEADLESS) { await page.setViewportSize({ width: VIEW_W, height: VIEW_H }); return; }
  const s = await page.context().newCDPSession(page);
  try {
    const { windowId } = await s.send('Browser.getWindowForTarget');
    await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    for (let i = 0; i < 3; i++) {
      const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      if (vp.w === VIEW_W && vp.h === VIEW_H) break;
      const { bounds } = await s.send('Browser.getWindowBounds', { windowId });
      await s.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width + VIEW_W - vp.w, height: bounds.height + VIEW_H - vp.h } });
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch {} finally { await s.detach().catch(() => {}); }
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  if (vp.w !== VIEW_W || vp.h !== VIEW_H) console.log(c.yellow(`  Page area is ${vp.w}x${vp.h} (screen too small for ${VIEW_W}x${VIEW_H}). Overflowing pages are also captured in full.`));
}

// ---------- video ----------

const VIDEO_MAX_S = 60;
const which = (bin) => { try { return execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };

// Records the page area of the current tab. macOS: `screencapture -v -R` on the window's page
// rectangle, so the video has the display's full resolution (2880x1800 on Retina). Other systems:
// Chrome's screencast (1x) piped to ffmpeg at 30 fps.
async function startVideo(page, base) {
  if (process.platform === 'darwin' && !HEADLESS) {
    const r = await page.evaluate(() => ({ x: screenX + (outerWidth - innerWidth) / 2, y: screenY + (outerHeight - innerHeight), w: innerWidth, h: innerHeight }));
    const file = `${base}.mov`;
    const proc = spawn('screencapture', ['-v', '-x', `-V${VIDEO_MAX_S}`, `-R${Math.round(r.x)},${Math.round(r.y)},${r.w},${r.h}`, file], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => { err += d; });
    const t0 = Date.now();
    await new Promise((res) => setTimeout(res, 600));
    if (proc.exitCode !== null) throw new Error(`screencapture failed${err ? `: ${err.trim()}` : ''}. Allow Screen Recording for your terminal in System Settings → Privacy & Security.`);
    return {
      file,
      started: t0,
      async stop() {
        // screencapture stops on any key typed into it
        try { proc.stdin.write('q\n'); } catch {}
        const done = new Promise((res) => proc.on('close', res));
        const t = setTimeout(() => proc.kill('SIGINT'), 4000);
        await done; clearTimeout(t);
        return { seconds: Math.round((Date.now() - t0) / 100) / 10 };
      },
    };
  }
  const ff = which('ffmpeg');
  if (!ff) throw new Error('ffmpeg was not found (macOS: brew install ffmpeg, Linux: apt install ffmpeg)');
  const FPS = 30;
  const file = `${base}.mp4`;
  const proc = spawn(ff, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file],
  { stdio: ['pipe', 'ignore', 'inherit'] });
  const s = await page.context().newCDPSession(page);
  let last = null, t0 = 0, frames = 0;
  s.on('Page.screencastFrame', (f) => {
    last = Buffer.from(f.data, 'base64');
    if (!t0) t0 = Date.now();
    s.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await s.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW_W * 2, maxHeight: VIEW_H * 2 });
  // Chrome only sends a frame when something changes; repeat the latest one to keep 30 fps
  const timer = setInterval(() => {
    if (!last) return;
    const due = Math.floor(((Date.now() - t0) / 1000) * FPS) + 1;
    while (frames < due) { proc.stdin.write(last); frames++; }
  }, 1000 / FPS / 2);
  return {
    file,
    started: Date.now(),
    async stop() {
      clearInterval(timer);
      await s.send('Page.stopScreencast').catch(() => {});
      await s.detach().catch(() => {});
      proc.stdin.end();
      await new Promise((res) => proc.on('close', res));
      return { seconds: Math.round((frames / FPS) * 10) / 10 };
    },
  };
}

// ---------- one gateway ----------

// Where this run archived a gateway's earlier recording; it is put back when the new attempt is
// skipped or captured nothing, so an empty attempt never replaces a good recording.
const ARCHIVED = new Map();
function restorePrevious(g, dir) {
  const prev = ARCHIVED.get(g.id);
  if (!prev || !fs.existsSync(prev)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(prev, dir);
  ARCHIVED.delete(g.id);
  console.log(c.dim('  the previous recording was kept'));
  return true;
}

async function recordOne(context, g, idx, count, restarted = false) {
  const dir = path.join(OUT, g.id);
  console.log(`\n${c.bold(`[${idx}/${count}] ${g.name}`)} ${c.dim(g.mcp_url)}`);
  const d = await discover(g);
  if (!d.authorize_url) {
    console.log(c.yellow(`  No authorization link (${d.stage}${d.dcr?.error ? `: ${d.dcr.error}` : ''}). Skipping.`));
    return { outcome: 'no_authorize', stage: d.stage };
  }
  // Keep the previous recording of this gateway instead of deleting it.
  if (fs.existsSync(path.join(dir, 'session.json')) && !restarted) {
    const prev = JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8'));
    let dest = path.join(HISTORY, g.id, (prev.recorded_at || String(Date.now())).replace(/[:.]/g, '-'));
    // the same recording can be archived twice (restored, then replaced again): keep both copies
    if (fs.existsSync(dest)) dest = `${dest}-${Date.now()}`;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(dir, dest);
    ARCHIVED.set(g.id, dest);
    console.log(c.dim(`  previous recording kept in data/raw/auth-history/${g.id}/`));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const page = await context.newPage();
  await fixWindow(page);
  const steps = [];
  let callback = null;
  await page.route(`${REDIRECT_URI}**`, (route) => {
    const u = new URL(route.request().url());
    callback = { error: u.searchParams.get('error'), has_code: u.searchParams.has('code') };
    route.fulfill({ status: 200, contentType: 'text/html', body: '<body style="font:16px system-ui;padding:40px">Returned to the client. No token was exchanged; you can close this tab.</body>' });
  });

  async function shoot(manual = false) {
    const host = (() => { try { return new URL(page.url()).host; } catch { return ''; } })();
    if (!manual && !KEEP_GOOGLE && /(^|\.)accounts\.google\.com$/.test(host)) return;
    if (!manual && (page.url() === 'about:blank' || page.url().startsWith('chrome'))) return;
    const n = String(steps.length + 1).padStart(2, '0');
    const png = path.join(dir, `${n}.png`);
    try {
      await page.screenshot({ path: png, type: 'png' });
      await sharp(png).webp({ quality: 88 }).toFile(path.join(dir, `${n}.webp`));
    } catch (e) {
      console.log(c.red(`  capture failed: ${e.message.split('\n')[0]}`));
      return;
    }
    const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scroll_h: document.documentElement.scrollHeight })).catch(() => null);
    let full = null;
    if (vp && vp.scroll_h > vp.h + 8) {
      try {
        const fpng = path.join(dir, `${n}-full.png`);
        await page.screenshot({ path: fpng, type: 'png', fullPage: true });
        await sharp(fpng).webp({ quality: 85 }).toFile(path.join(dir, `${n}-full.webp`));
        full = `${n}-full.webp`;
      } catch {}
    }
    const step = { n: steps.length + 1, file: `${n}.webp`, full_page: full, url: cleanUrl(page.url()), host, title: await page.title().catch(() => ''), at: new Date().toISOString(), manual, viewport: vp };
    steps.push(step);
    console.log(`  ${c.green('●')} ${n} ${host}${c.dim(new URL(page.url()).pathname.slice(0, 60))}${manual ? c.dim(' (manual)') : ''}${full ? c.dim(' + full page') : ''}`);
  }

  console.log(c.dim('  Sign in in the browser. New screens are captured automatically.'));
  console.log(c.dim('  [Enter] finish · [c] capture now · [v] video on/off · [r] restart · [s] skip · [q] quit'));
  await page.goto(d.authorize_url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

  let action = null;
  const stopKeys = keyInput((k) => {
    if (k === 'enter') action = 'done';
    else if (k === 'c') action = action || 'capture';
    else if (k === 'v') action = action || 'video';
    else if (k === 'r') action = 'restart';
    else if (k === 's') action = 'skip';
    else if (k === 'q') action = 'quit';
  });
  const started = Date.now();
  let lastKey = null, candidate = null, since = 0;
  let video = null; // { rec, step, at }
  const stopVideo = async () => {
    if (!video) return;
    const v = video; video = null;
    const { seconds } = await v.rec.stop();
    if (!fs.existsSync(v.rec.file)) { console.log(c.red('  video was not saved')); return; }
    v.step.video = path.basename(v.rec.file);
    v.step.video_seconds = seconds;
    const mb = (fs.statSync(v.rec.file).size / 1e6).toFixed(1);
    console.log(`  ${c.green('■')} video ${v.step.video} ${c.dim(`${seconds}s · ${mb} MB`)}`);
  };
  while (true) {
    if (AUTO && Date.now() - started > AUTO * 1000) action = 'done';
    if (action === 'capture') { action = null; await shoot(true); }
    if (action === 'video') {
      action = null;
      if (video) await stopVideo();
      else {
        // the still of this screen doubles as the video's poster
        await shoot(true);
        const step = steps[steps.length - 1];
        try {
          const rec = await startVideo(page, path.join(dir, String(step.n).padStart(2, '0')));
          video = { rec, step };
          console.log(`  ${c.red('●')} recording video… ${c.dim('[v] to stop, 5-10 seconds is plenty')}`);
        } catch (e) { console.log(c.red(`  video: ${e.message}`)); }
      }
    }
    if (video && Date.now() - video.rec.started > VIDEO_MAX_S * 1000) await stopVideo();
    if (action) { await stopVideo(); break; }
    if (page.isClosed()) { action = 'done'; await stopVideo(); break; }
    const key = video ? lastKey : await pageKey(page);
    if (key && key !== lastKey) {
      if (key !== candidate) { candidate = key; since = Date.now(); }
      else if (Date.now() - since > 1200) { lastKey = key; await shoot(false); }
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  stopKeys();
  if (action === 'restart') { await page.close().catch(() => {}); return recordOne(context, g, idx, count, true); }
  await page.close().catch(() => {});
  if (action === 'skip') {
    console.log(c.dim('  skipped'));
    if (!restorePrevious(g, dir)) fs.rmSync(dir, { recursive: true, force: true });
    return { outcome: 'skipped' };
  }
  if (!steps.length && !callback && action === 'quit') { restorePrevious(g, dir); return { outcome: 'no_screens', quit: true }; }

  // Structured feedback for ranking later (also editable in data/raw/ratings.json).
  let redirect = null, rating = null;
  if (action !== 'quit') {
    const r = (await ask('  Back to the MCP gateway after sign-up/onboarding? [y]es / [n]o / Enter = no onboarding: ')).toLowerCase();
    redirect = r.startsWith('y') ? 'kept' : r.startsWith('n') ? 'lost' : null;
    const u = await ask('  UI rating 1-5 (Enter to skip): ');
    rating = /^[1-5]$/.test(u) ? Number(u) : null;
  }
  const note = action === 'quit' ? '' : await ask('  Note (Enter to leave empty): ');
  if (redirect || rating || note) {
    const ratings = fs.existsSync(RATINGS) ? JSON.parse(fs.readFileSync(RATINGS, 'utf8')) : {};
    ratings[g.id] = { ...(ratings[g.id] || {}), ...(redirect ? { redirect_after_onboarding: redirect } : {}),
      ...(rating ? { ui_rating: rating } : {}), ...(note ? { ui_feedback: note } : {}), updated_at: new Date().toISOString() };
    fs.writeFileSync(RATINGS, JSON.stringify(ratings, null, 2) + '\n');
  }
  const session = {
    id: g.id, name: g.name, mcp_url: g.mcp_url, outcome: steps.length ? 'done' : 'no_screens',
    recorded_at: new Date(started).toISOString(), finished_at: new Date().toISOString(),
    authorize_host: new URL(d.authorize_url).host, scopes: d.scopes_requested || [],
    returned_to_client: callback, steps, note: note || null,
    redirect_after_onboarding: redirect, ui_rating: rating,
  };
  if (!steps.length && !callback && !note && restorePrevious(g, dir)) return { outcome: 'no_screens', quit: action === 'quit' };
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session, null, 2));
  console.log(c.dim(`  saved ${steps.length} screen(s) to data/raw/auth-scans/${g.id}/`));
  return { outcome: session.outcome, quit: action === 'quit' };
}

// ---------- main ----------

async function setup() {
  console.log('Opening Chrome with the recording profile.');
  console.log('Sign in to the Google account you want to use, then quit Chrome (Cmd+Q / Ctrl+Q).');
  const proc = launchChrome(false);
  await new Promise((res) => proc.on('exit', res));
  console.log(c.green('Profile saved. Run `npm run record` to start.'));
}

// Recordings made while the repository briefly used a private/ folder are moved back to data/.
function adoptPrivateFolder() {
  const old = path.join(ROOT, 'private');
  if (!fs.existsSync(path.join(old, 'auth-scans'))) return;
  for (const id of fs.readdirSync(path.join(old, 'auth-scans'))) {
    const from = path.join(old, 'auth-scans', id), to = path.join(OUT, id);
    if (!fs.statSync(from).isDirectory()) continue;
    if (fs.existsSync(to)) {
      const dest = path.join(HISTORY, id, `before-private-${Date.now()}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(to, dest);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    console.log(c.dim(`moved private/auth-scans/${id} to data/raw/auth-scans/${id}`));
  }
  for (const name of ['ratings.json', 'feedback.json']) {
    const f = path.join(old, name);
    if (!fs.existsSync(f)) continue;
    const target = path.join(path.dirname(RATINGS), name);
    const cur = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
    const add = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [id, v] of Object.entries(add)) cur[id] = { ...(cur[id] || {}), ...v };
    fs.writeFileSync(target, JSON.stringify(cur, null, 2) + '\n');
    fs.rmSync(f);
  }
}

async function main() {
  adoptPrivateFolder();
  if (has('--setup')) return setup();
  const { queue, total, done } = buildQueue();
  console.log(`${c.bold('MCP gateway recorder')} · group ${GROUP} · ${done}/${total} recorded · ${queue.length} to go`);
  if (!queue.length) { console.log('Nothing to record.'); return; }
  console.log(c.dim(`Profile: ${PROFILE}`));
  const { browser, proc, context } = await connect();
  const cleanup = async () => { await browser.close().catch(() => {}); proc.kill(); };
  process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
  let n = 0;
  for (const g of queue) {
    n++;
    const r = await recordOne(context, g, n, queue.length).catch((e) => { console.log(c.red(`  error: ${e.message.split('\n')[0]}`)); return {}; });
    if (r.quit) break;
  }
  await cleanup();
  console.log(`\n${c.bold('Done.')} Captures are in ${c.bold('data/raw/auth-scans/')} (not committed). Run ${c.bold('npm run prepare-data')} to publish them masked.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
