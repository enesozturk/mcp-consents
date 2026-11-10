// Publishes a recorded video with the same partial masking as the screenshots.
//
// The video is split into frames; every few frames are read with OCR, and each frame gets the
// regions found in the readings around it (so a word that OCR misses for a moment stays masked).
// Frames are cropped to the gallery's 16:10 frame, scaled to 2880x1800 and encoded as an H.264
// MP4 at 60 fps without audio (crf 25: no visible loss on UI). The
// first masked frame is also written as a WebP poster next to it (<dest>.webp).
// The result is cached by source and term list, so re-running prepare-data is cheap.
//
//   const { maskVideo } = require('./mask-video.cjs')
//   await maskVideo(src, dest, { gateway })  -> { frames, masked_frames, regions: [...] }
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const P = require('./paths.cjs');
const { ocr, findRegions, maskBlock, loadTerms } = require('./mask-personal.cjs');

const FPS = 60; // UI motion (floating icons, fades) looks stuttery at 30
const EVERY = FPS / 6; // OCR 6 frames per second
const REACH = EVERY * 2; // a frame uses the readings within this many frames

const hashFile = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

// start / end (seconds) trim the source before anything else.
async function maskVideo(src, dest, { gateway, start = 0, end = null } = {}) {
  const terms = loadTerms(gateway);
  const termsKey = 'v9' + crypto.createHash('sha1').update(JSON.stringify([terms.phrases, terms.contains, terms.patterns.map(String), [...terms.ignore], terms.keep])).digest('hex').slice(0, 8);
  const key = `${hashFile(src)}-${termsKey}${start || end ? `-${start}-${end ?? ''}` : ''}`;
  const cacheDir = path.join(P.MASK_CACHE, 'videos');
  const cached = path.join(cacheDir, `${key}.mp4`);
  const cachedInfo = path.join(cacheDir, `${key}.json`);
  if (fs.existsSync(cached) && fs.existsSync(cachedInfo) && fs.existsSync(`${cached}.webp`)) {
    fs.copyFileSync(cached, dest);
    fs.copyFileSync(`${cached}.webp`, `${dest}.webp`);
    return JSON.parse(fs.readFileSync(cachedInfo, 'utf8'));
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mask-video-'));
  try {
    const raw = path.join(tmp, 'raw'), out = path.join(tmp, 'out');
    fs.mkdirSync(raw); fs.mkdirSync(out);
    execFileSync('ffmpeg', ['-loglevel', 'error', ...(start ? ['-ss', String(start)] : []), ...(end ? ['-to', String(end)] : []), '-i', src, '-vf',
      `crop='min(iw,ih*1.6)':'min(ih,iw/1.6)',fps=${FPS},scale='min(2880,iw)':-2:flags=lanczos`, '-q:v', '2', path.join(raw, '%05d.jpg')]);
    const frames = fs.readdirSync(raw).filter((f) => f.endsWith('.jpg')).sort();
    if (!frames.length) throw new Error('no frames decoded');

    // OCR readings: every EVERY frames, then every frame wherever two readings disagree
    // (something moves or fades there, so a reading in between may differ)
    const read = (i) => { if (!readings.has(i)) readings.set(i, findRegions(ocr(path.join(raw, frames[i])), terms)); return readings.get(i); };
    const sig = (rs) => rs.map((r) => `${r.text}|${Math.round(r.x / 12)}|${Math.round(r.y / 12)}`).sort().join(';');
    const readings = new Map();
    const sampled = [];
    for (let i = 0; i < frames.length; i += EVERY) sampled.push(i);
    if (sampled[sampled.length - 1] !== frames.length - 1) sampled.push(frames.length - 1);
    for (const i of sampled) read(i);
    for (let k = 0; k + 1 < sampled.length; k++) {
      if (sig(read(sampled[k])) === sig(read(sampled[k + 1]))) continue;
      for (let i = sampled[k] + 1; i < sampled[k + 1]; i++) read(i);
    }

    const sharp = require('sharp');
    const meta = await sharp(path.join(raw, frames[0])).metadata();

    // Track each personal word through the video as one cluster (same text, about the same place)
    // with one fixed box and one pixelated block, so masks do not shimmer when OCR boxes jitter
    // by a pixel or the cursor passes over the text.
    const clusters = [];
    const present = new Map(); // reading frame -> Set of cluster ids
    for (const f of [...readings.keys()].sort((a, b) => a - b)) {
      const ids = new Set();
      for (const r of readings.get(f)) {
        let c = clusters.find((k) => k.text === r.text && Math.abs(k.x0 - r.x) <= 6 && Math.abs(k.y0 - r.y) <= 4);
        if (!c) { c = { id: clusters.length, text: r.text, x0: r.x, y0: r.y, ref: f, boxes: [] }; clusters.push(c); }
        c.boxes.push({ ...r, f });
        ids.add(c.id);
      }
      present.set(f, ids);
    }
    for (const c of clusters) {
      // one real OCR box per cluster, the one that read the word most completely (the widest), so
      // the block keeps the same first letters as the screenshots do
      const ref = c.boxes.reduce((a, b) => (b.w > a.w ? b : a));
      c.ref = ref.f;
      c.region = { text: c.text, x: ref.x, y: ref.y, w: ref.w, h: ref.h };
      c.part = await maskBlock(path.join(raw, frames[c.ref]), c.region, terms.keep, meta);
    }
    const sortedReads = [...present.keys()].sort((a, b) => a - b);
    const at = (k) => (k >= 0 && k < sortedReads.length ? present.get(sortedReads[k]) : new Set());
    // clusters on screen at frame i: in the readings just before or after it, or in both
    // readings one further out (OCR missed it in between)
    const activeAt = (i) => {
      let k = sortedReads.findIndex((f) => f >= i);
      if (k < 0) k = sortedReads.length - 1;
      const n = k, p = sortedReads[k] === i ? k : k - 1;
      const out = new Set([...at(p), ...at(n)]);
      for (const id of at(p - 1)) if (at(n + 1).has(id)) out.add(id);
      return out;
    };

    // mean absolute difference (0-255) between frame i and the nearest reading that found the most
    // personal text, on small grayscale copies
    const thumbs = new Map();
    const thumb = async (i) => {
      if (!thumbs.has(i)) thumbs.set(i, await sharp(path.join(raw, frames[i])).resize(180, 112, { fit: 'fill' }).grayscale().raw().toBuffer());
      return thumbs.get(i);
    };
    const diffToNearestFull = async (i) => {
      let best = null;
      for (const [j, ids] of present) if (Math.abs(j - i) <= REACH && ids.size && (!best || ids.size > present.get(best).size || (ids.size === present.get(best).size && Math.abs(j - i) < Math.abs(best - i)))) best = j;
      if (best === null) return 0;
      const a = await thumb(i), b = await thumb(best);
      let d = 0;
      for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]);
      return d / a.length;
    };

    const seen = new Set();
    let maskedFrames = 0;
    for (let i = 0; i < frames.length; i++) {
      const from = path.join(raw, frames[i]), to = path.join(out, frames[i]);
      const active = [...activeAt(i)].map((id) => clusters[id]);
      // A frame whose own reading finds less than its neighbours is mid-transition (blurred,
      // fading or moving), where OCR cannot read the text but people still can: blur a wider
      // area around where the neighbours found personal text.
      const own = readings.get(i);
      const nearIds = new Set();
      let nearMax = 0;
      for (const [j, ids] of present) if (Math.abs(j - i) <= REACH) { ids.forEach((id) => nearIds.add(id)); nearMax = Math.max(nearMax, ids.size); }
      // ...but only when the picture really changed: the cursor passing over a word also makes OCR
      // miss it, and then the fixed blocks stay
      const changed = own && own.length < nearMax ? (await diffToNearestFull(i)) > 2.5 : false;
      const soft = changed ? [...nearIds].map((id) => clusters[id].region) : [];
      const parts = [];
      for (const r of soft) {
        const left = Math.max(0, Math.round(r.x - r.w * 0.5)), top = Math.max(0, Math.round(r.y - r.h * 4));
        const width = Math.min(meta.width - left, Math.round(r.w * 2)), height = Math.min(meta.height - top, Math.round(r.h * 11));
        if (width < 8 || height < 8) continue;
        parts.push({ input: await sharp(from).extract({ left, top, width, height }).blur(Math.max(12, r.h)).toBuffer(), left, top });
      }
      // in a transition frame the text has moved away from the fixed boxes; the blur covers it
      if (!soft.length) for (const c of active) if (c.part) parts.push(c.part);
      // anything this frame's own reading found that no fixed block covers (the layout is moving)
      // is masked where it is
      for (const r of own || []) {
        const covered = !soft.length && active.some((c) => c.part && c.text === r.text
          && Math.abs(c.region.y - r.y) <= 4 && Math.abs(c.region.x - r.x) <= 6);
        if (covered) continue;
        const part = await maskBlock(from, r, terms.keep, meta);
        if (part) parts.push(part);
        seen.add(r.text);
      }
      if (parts.length) {
        await sharp(from).composite(parts).jpeg({ quality: 95 }).toFile(to);
        maskedFrames++;
        active.forEach((c) => seen.add(c.text));
      } else fs.copyFileSync(from, to);
    }
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(out, '%05d.jpg'),
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-an', dest]);
    await sharp(path.join(out, frames[0])).webp({ quality: 88 }).toFile(`${dest}.webp`);
    const info = { frames: frames.length, seconds: Math.round((frames.length / FPS) * 10) / 10, masked_frames: maskedFrames, regions: [...seen] };
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.copyFileSync(dest, cached);
    fs.copyFileSync(`${dest}.webp`, `${cached}.webp`);
    fs.writeFileSync(cachedInfo, JSON.stringify(info));
    return info;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { maskVideo };

if (require.main === module) {
  const [src, dest, gateway] = process.argv.slice(2);
  maskVideo(src, dest, { gateway }).then((r) => console.log(JSON.stringify(r)));
}
