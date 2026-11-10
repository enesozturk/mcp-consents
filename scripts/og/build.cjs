const sharp = require('sharp');
const path = require('path');
const S = __dirname;
const ROOT = path.resolve(__dirname, '../..');
const C = {
  notion: ['/auth/notion/04.webp', [470, 100, 500, 700]],
  stripe: ['/auth/stripe/06.webp', [700, 120, 640, 680]],
  posthog: ['/auth/posthog/04.webp', [370, 30, 700, 560]],
  prisma: ['/auth/prisma/02.webp', [450, 110, 540, 540]],
  cloudflare: ['/shots/cloudflare-2/light.webp', [390, 80, 740, 640]],
  expo: ['/auth/expo/05.webp', [500, 50, 440, 620]],
  intercom: ['/shots/intercom/light.webp', [480, 80, 480, 620]],
  lumin: ['/auth/lumin/01.webp', [250, 80, 940, 560]],
  resend: ['/auth/resend/01.webp', [430, 90, 600, 640]],
  clerk: ['/auth/clerk/02.webp', [490, 40, 460, 620]],
  railway: ['/auth/railway/02.webp', [380, 150, 680, 560]],
  firecrawl: ['/auth/firecrawl/06.webp', [490, 60, 460, 560]],
  linear: ['/auth/linear/01.webp', [480, 170, 480, 560]],
  appwrite: ['/auth/appwrite/03.webp', [440, 60, 580, 700]],
  clarify: ['/auth/clarify/01.webp', [490, 20, 460, 640]],
  base44: ['/auth/base44/02.webp', [460, 60, 520, 640]],
  mapbox: ['/auth/mapbox--mapbox/05.webp', [420, 90, 600, 560]],
  close: ['/auth/close/11.webp', [500, 40, 440, 640]],
};
(async () => {
  const parts = []; let i = 0;
  for (const [id, [src, [x, y, w, h]]] of Object.entries(C)) {
    const img = sharp(ROOT + '/public' + src);
    const m = await img.metadata(); const k = m.width / 1440;
    const out = `${S}/${id}.png`;
    await sharp(ROOT + '/public' + src).extract({ left: Math.round(x * k), top: Math.round(y * k), width: Math.round(w * k), height: Math.round(Math.min(h, 900 - y) * k) })
      .resize({ width: 560 }).png().toFile(out);
    const t = await sharp(out).resize({ width: 240 }).png().toBuffer();
    parts.push({ input: t, left: (i % 9) * 246, top: Math.floor(i / 9) * 380 }); i++;
  }
  await sharp({ create: { width: 9 * 246, height: 760, channels: 3, background: '#999' } }).composite(parts).png().toFile(`${S}/cropsheet.png`);
})();
