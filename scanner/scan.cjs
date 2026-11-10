#!/usr/bin/env node
// Scans remote MCP servers: OAuth discovery -> DCR -> authorize URL -> screenshot.
// Usage: node scan.cjs <servers.json> <outDir> [--only id1,id2] [--concurrency 4] [--force]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SERVERS = args[0];
const OUT = args[1];
const ONLY = flag('--only', '') ? flag('--only').split(',') : null;
const CONC = parseInt(flag('--concurrency', '4'), 10);
const FORCE = args.includes('--force');

const { discover, REDIRECT_URI } = require('./lib/oauth.cjs');

async function capture(browser, r, dir) {
  const shots = [];
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
      colorScheme: theme, locale: 'en-US' });
    const page = await ctx.newPage();
    const chain = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) chain.push(f.url()); });
    try {
      await page.goto(r.authorize_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const file = `gateway-${theme}.png`;
      await page.screenshot({ path: path.join(dir, file) });
      shots.push({ file, theme, kind: 'viewport' });
      if (theme === 'light') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(dir, 'gateway-mobile.png') });
        shots.push({ file: 'gateway-mobile.png', theme, kind: 'mobile' });
        r.landing = {
          final_url: page.url(), host: new URL(page.url()).host, title: await page.title(),
          redirect_chain: [...new Set(chain)],
          text: (await page.evaluate(() => document.body?.innerText || '')).slice(0, 3000),
          redirected_to_callback: page.url().startsWith(REDIRECT_URI),
        };
      }
    } catch (e) {
      r.capture_error = String(e.message || e).slice(0, 300);
    } finally { await ctx.close(); }
  }
  r.screenshots = shots;
}

async function main() {
  const servers = JSON.parse(fs.readFileSync(SERVERS, 'utf8')).filter((s) => !ONLY || ONLY.includes(s.id));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  let i = 0, done = 0;
  async function worker() {
    while (i < servers.length) {
      const s = servers[i++];
      const dir = path.join(OUT, s.id);
      if (!FORCE && fs.existsSync(path.join(dir, 'scan.json'))) { done++; continue; }
      fs.mkdirSync(dir, { recursive: true });
      let r;
      try {
        r = await discover(s);
        if (r.authorize_url) await capture(browser, r, dir);
      } catch (e) { r = { mcp_url: s.mcp_url, stage: 'error', error: String(e) }; }
      r.id = s.id; r.scanned_at = new Date().toISOString();
      fs.writeFileSync(path.join(dir, 'scan.json'), JSON.stringify(r, null, 2));
      done++;
      console.log(`[${done}/${servers.length}] ${s.id}: ${r.stage}${r.landing ? ' -> ' + r.landing.host : ''}${r.capture_error ? ' (capture err)' : ''}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  await browser.close();
}
main();
