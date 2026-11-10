#!/usr/bin/env node
// Partially masks personal info in screenshots: finds personal phrases with OCR (tesseract) and
// pixelates each one except its first few letters, so a reader still sees that an account,
// workspace or email is shown without being able to read it.
//
// Phrases and patterns live in data/raw/personal-terms.json (format: data/personal-terms.example.json).
// Results are cached per image in data/raw/mask-cache/<id>/<file>.<content hash>.json so OCR runs
// once per image version.
//
// Usage (library): const { maskImage } = require('./mask-personal.cjs')
//   await maskImage(srcPath, destPath, { cacheKey, gateway })  -> { masked: n, regions: [...] }
// Usage (CLI):     node scripts/mask-personal.cjs <src.webp> <dest.png>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const P = require('./paths.cjs');
const TERMS_FILE = fs.existsSync(P.TERMS) ? P.TERMS : P.TERMS_EXAMPLE;
const CACHE = P.MASK_CACHE;

// a possessive "'s" is dropped so "Doe's" matches the term "Doe"
const norm = (s) => s.replace(/['’`]s$/i, '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9@._-]/g, '').replace(/l/g, 'i').replace(/0/g, 'o');

// `gateway` drops the terms listed for it under `exempt` (a brand name on its own page).
function loadTerms(gateway) {
  const t = JSON.parse(fs.readFileSync(TERMS_FILE, 'utf8'));
  const skip = new Set(((gateway && t.exempt?.[gateway]) || []).map((x) => x.toLowerCase()));
  return {
    phrases: (t.phrases || []).filter((p) => !skip.has(p.toLowerCase())).map((p) => p.split(/\s+/).map(norm).filter(Boolean)).filter((p) => p.length),
    contains: (t.contains || []).map(norm),
    patterns: (t.patterns || []).map((p) => new RegExp(p, 'i')),
    keep: t.keep_chars ?? 3,
    ignore: new Set((t.ignore || []).map(norm)),
  };
}

function ocr(png) {
  const tsv = execFileSync('tesseract', [png, '-', '--psm', '11', 'tsv'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const words = [];
  for (const line of tsv.split('\n').slice(1)) {
    const c = line.split('\t');
    if (c.length < 12 || !c[11].trim() || Number(c[10]) < 30) continue;
    words.push({ block: +c[2], par: +c[3], line: +c[4], x: +c[6], y: +c[7], w: +c[8], h: +c[9], text: c[11] });
  }
  return words;
}

// Group OCR words into visual lines, then find personal phrases as runs of words.
function findRegions(words, terms) {
  // visual lines: words whose vertical centres line up (sparse OCR often splits one line into
  // several of its own "lines", which would keep the parts of an email apart)
  const lines = new Map();
  const rows = [];
  for (const w of [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))) {
    const c = w.y + w.h / 2;
    let row = rows.find((r) => Math.abs(r.c - c) < Math.max(r.h, w.h) * 0.5);
    if (!row) { row = { c, h: w.h, words: [] }; rows.push(row); lines.set(rows.length, row.words); }
    row.words.push(w);
  }
  const regions = [];
  const pendingIdBelow = [];
  for (const ws of lines.values()) {
    ws.sort((a, b) => a.x - b.x);
    const n = ws.map((w) => norm(w.text));
    const hit = new Array(ws.length).fill(false);
    for (let i = 0; i < ws.length; i++) {
      if (terms.ignore.has(n[i])) continue;
      // patterns also match a word wrapped in quotes or punctuation ("jane@gmail.com".)
      const bare = ws[i].text.replace(/^[^\w]+|[^\w]+$/g, '');
      if (terms.patterns.some((re) => re.test(ws[i].text) || re.test(bare))) hit[i] = true;
      if (terms.contains.some((c) => n[i].includes(c))) hit[i] = true;
      // OCR sometimes splits a handle ("janedo" + "e99@gmail.com"): a fragment of 5+ letters that
      // starts a personal handle counts too
      const frag = n[i].replace(/[.…]+$/, '');
      if (frag.length >= 5 && terms.contains.some((c) => c.startsWith(frag))) hit[i] = true;
      for (const p of terms.phrases) {
        if (i + p.length > ws.length) continue;
        if (p.every((t, j) => n[i + j] === t || (t.length > 5 && n[i + j].startsWith(t)))) for (let j = 0; j < p.length; j++) hit[i + j] = true;
      }
    }
    // OAuth client IDs: the value after a "Client ID" / "Application ID" / "App ID" label
    const joined = ws.map((w) => w.text).join(' ');
    const label = /\b(client|application|app)[\s_-]*id\b/i.exec(joined);
    if (label) {
      const idLike = (t) => t.replace(/[^\w-]/g, '').length >= 8 && /\d/.test(t);
      // index of the word that ends the label
      let pos = 0, at = -1;
      for (let k = 0; k < ws.length; k++) { pos += ws[k].text.length + 1; if (pos > label.index + label[0].length) { at = k; break; } }
      // OCR often splits an ID into pieces: from the first ID-like piece on, mask the rest of the line
      let found = false;
      for (let k = at + 1; k < ws.length; k++) if (found || idLike(ws[k].text)) { hit[k] = true; found = true; }
      if (!found) pendingIdBelow.push({ x: Math.min(...ws.map((w) => w.x)), y: ws[Math.max(0, at)].y, h: ws[Math.max(0, at)].h });
    }
    // merge adjacent hits into one region per phrase
    for (let i = 0; i < ws.length; i++) {
      if (!hit[i]) continue;
      let j = i;
      // hits close together on a line become one block, so text OCR missed between them is covered too
      while (j + 1 < ws.length && hit[j + 1] && ws[j + 1].x - (ws[j].x + ws[j].w) < ws[j].h * 4) j++;
      const run = ws.slice(i, j + 1);
      const x0 = Math.min(...run.map((w) => w.x)), y0 = Math.min(...run.map((w) => w.y));
      const x1 = Math.max(...run.map((w) => w.x + w.w)), y1 = Math.max(...run.map((w) => w.y + w.h));
      regions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, text: run.map((w) => w.text).join(' ') });
      i = j;
    }
  }
  // a label with its value on the next line (stacked layout)
  for (const lab of pendingIdBelow) {
    const below = words.filter((w) => w.y > lab.y + lab.h * 0.5 && w.y < lab.y + lab.h * 3.5 && w.x >= lab.x - lab.h * 2);
    if (!below.length) continue;
    // the first row under the label holds the value, possibly split into pieces
    const top = Math.min(...below.map((w) => w.y));
    const row = below.filter((w) => w.y < top + lab.h * 0.8).sort((a, b) => a.x - b.x);
    const text = row.map((w) => w.text).join('');
    if (text.replace(/[^\w-]/g, '').length < 8 || !/\d/.test(text)) continue;
    const x0 = Math.min(...row.map((w) => w.x)), y0 = Math.min(...row.map((w) => w.y));
    const x1 = Math.max(...row.map((w) => w.x + w.w)), y1 = Math.max(...row.map((w) => w.y + w.h));
    regions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, text: row.map((w) => w.text).join(' ') });
  }
  return regions;
}

// Find the x where the visible prefix ends: the emptiest pixel column (a gap between letters)
// near the proportional estimate, so the mask never cuts through a letter.
async function prefixEnd(src, r, visible, chars) {
  const est = r.x + (r.w / chars) * visible;
  // Count letters from the left by their columns of ink; stop after `visible` letters.
  {
    const { data, info } = await sharp(src).extract({ left: r.x, top: r.y, width: r.w, height: r.h })
      .greyscale().raw().toBuffer({ resolveWithObject: true });
    const col = (x) => { let s = 0; for (let y = 0; y < info.height; y++) s += data[y * info.width + x]; return s / info.height; };
    const edge = (col(0) + col(info.width - 1)) / 2;
    let bg = 0; for (let y = 0; y < info.height; y++) bg += data[y * info.width]; bg /= info.height;
    const ink = (x) => { let m = 0; for (let y = 0; y < info.height; y++) m = Math.max(m, Math.abs(data[y * info.width + x] - bg)); return m; };
    let letters = 0, inLetter = false;
    for (let x = 0; x < info.width; x++) {
      const on = ink(x) > 60;
      if (on && !inLetter) inLetter = true;
      if (!on && inLetter) {
        inLetter = false;
        letters++;
        // glyphs that touch (small text) look like one letter here: never reveal much more than
        // the proportional estimate
        if (letters === visible) return Math.min(r.x + x + 1, Math.round(est + (r.w / chars) * 0.8));
      }
    }
    void edge;
  }
  // Fallback: the emptiest column near the proportional estimate.
  const charW = r.w / chars;
  const from = Math.max(r.x + 1, Math.round(est - charW * 0.45));
  const to = Math.min(r.x + r.w - 1, Math.round(est + charW * 0.55));
  if (to <= from) return Math.round(est);
  const { data, info } = await sharp(src).extract({ left: from, top: r.y, width: to - from, height: r.h })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  // background = brightest/darkest dominant value at the strip edges; ink = distance from it
  let bg = 0; for (let y = 0; y < info.height; y++) bg += data[y * info.width];
  bg /= info.height;
  const inks = [];
  for (let x = 0; x < info.width; x++) {
    let ink = 0;
    for (let y = 0; y < info.height; y++) ink += Math.abs(data[y * info.width + x] - bg);
    inks.push(ink);
  }
  // columns that are (nearly) empty are gaps between letters; take the gap closest to the estimate
  const floor = Math.min(...inks);
  const limit = floor + info.height * 6;
  let best = -1;
  for (let x = 0; x < inks.length; x++) {
    if (inks[x] > limit) continue;
    if (best < 0 || Math.abs(from + x - est) < Math.abs(from + best - est)) best = x;
  }
  if (best < 0) return Math.round(est);
  // move to the right edge of that gap so the visible letter stays whole
  while (best + 1 < inks.length && inks[best + 1] <= limit) best++;
  return from + best - 1;
}

// Pixelate everything after the first `keep` characters of a region, as a softly rounded block.
// The pixelated, rounded block that covers one region (everything after its first letters).
// Returns a sharp composite part, or null when the region is too small.
// OCR boxes sometimes include a chip's or field's border, making the block much taller than
// the text: keep only the rows inside the box that actually hold ink.
async function tightenRows(src, r, meta) {
  const left = Math.max(0, r.x), top = Math.max(0, r.y);
  const width = Math.min(meta.width - left, r.w), height = Math.min(meta.height - top, r.h);
  if (width < 4 || height < 8) return r;
  const { data, info } = await sharp(src).extract({ left, top, width, height }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const ink = [];
  for (let y = 0; y < info.height; y++) {
    const row = data.subarray(y * info.width, (y + 1) * info.width);
    const sorted = Array.from(row).sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    let n = 0;
    for (const v of row) if (Math.abs(v - med) > 40) n++;
    ink.push(n > Math.max(2, info.width * 0.02));
  }
  const first = ink.indexOf(true), last = ink.lastIndexOf(true);
  if (first < 0 || last - first + 1 > height * 0.8) return r; // nothing to trim
  return { ...r, y: top + first, h: last - first + 1 };
}

async function maskBlock(src, r, keep, meta) {
  meta = meta || (await sharp(src).metadata());
  r = await tightenRows(src, r, meta);
  const chars = r.text.replace(/\s+/g, ' ').length || 1;
  const visible = Math.min(keep, Math.max(1, Math.floor(chars * 0.4)));
  const pad = Math.round(r.h * 0.22);
  const left = await prefixEnd(src, r, visible, chars);
  const top = Math.max(0, r.y - pad);
  const box = {
    left: Math.max(0, left),
    top,
    width: Math.min(meta.width - left, r.x + r.w - left + pad),
    height: Math.min(meta.height - top, r.h + pad * 2),
  };
  if (box.width < 6 || box.height < 6) return null;
  const cell = Math.max(6, Math.round(r.h / 1.7)); // chunky, deliberate blocks that scale with the text
  const small = await sharp(src).extract(box)
    .resize(Math.max(1, Math.round(box.width / cell)), Math.max(1, Math.round(box.height / cell)), { kernel: 'mitchell' })
    .toBuffer();
  const radius = Math.round(box.height * 0.28);
  const shape = Buffer.from(`<svg width="${box.width}" height="${box.height}"><rect width="100%" height="100%" rx="${radius}" ry="${radius}"/></svg>`);
  const block = await sharp(small).resize(box.width, box.height, { kernel: 'nearest' })
    .composite([{ input: shape, blend: 'dest-in' }]).png().toBuffer();
  return { input: block, left: box.left, top: box.top };
}

async function applyMasks(src, dest, regions, keep) {
  const img = sharp(src);
  const meta = await img.metadata();
  const parts = [];
  for (const r of regions) {
    const part = await maskBlock(src, r, keep, meta);
    if (part) parts.push(part);
  }
  const out = parts.length ? img.composite(parts) : img;
  if (dest.endsWith('.webp')) await out.webp({ quality: 88 }).toFile(dest);
  else if (dest.endsWith('.jpg')) await out.jpeg({ quality: 95 }).toFile(dest);
  else await out.png().toFile(dest);
  return parts.length;
}

async function maskImage(src, dest, { cacheKey, gateway } = {}) {
  const terms = loadTerms(gateway);
  let words;
  // the cache is keyed by name and content: a re-recorded image with the same file name must be OCRed again
  const hash = require('crypto').createHash('sha1').update(fs.readFileSync(src)).digest('hex').slice(0, 12);
  const cf = cacheKey ? path.join(CACHE, `${cacheKey}.${hash}.json`) : null;
  if (cf && fs.existsSync(cf)) words = JSON.parse(fs.readFileSync(cf, 'utf8'));
  else {
    const tmp = path.join(require('os').tmpdir(), `ocr-${process.pid}-${require('crypto').randomUUID()}.png`);
    await sharp(src).png().toFile(tmp);
    try {
      words = ocr(tmp);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      // never publish an image we could not check
      throw new Error(`OCR failed for ${cacheKey || src}: ${e.message.split('\n')[0]}`);
    }
    fs.rmSync(tmp, { force: true });
    if (cf) { fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, JSON.stringify(words)); }
  }
  const regions = findRegions(words, terms);
  const masked = await applyMasks(src, dest, regions, terms.keep);
  return { masked, regions };
}

module.exports = { maskImage, ocr, findRegions, applyMasks, maskBlock, loadTerms };

if (require.main === module) {
  const [src, dest] = process.argv.slice(2);
  maskImage(src, dest).then((r) => console.log(JSON.stringify(r.regions.map((x) => x.text))));
}
