# OG image

`public/og.png` (1200×630) is rendered from `og.html`.

1. `node scripts/og/build.cjs` crops the gateway screens into `scripts/og/<id>.png` (grayscale).
2. Put the brand icons next to them as `fav-<id>.png` and copy `public/favicon.svg` here.
3. Screenshot `og.html` at 1200×630 with deviceScaleFactor 2 and resize to 1200×630.

The crops, icons and the screenshot are build output and are not committed.
