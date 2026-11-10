# Maintaining the gallery

Raw material lives in `data/raw/`, which git ignores: it stays on the maintainer's machine and is
never published. Everything else in the repository is public.

| Path | What it is | Publish? |
| --- | --- | --- |
| `data/raw/auth-scans/<id>/` | Signed-in recordings from `npm run record`: unmasked screenshots, videos, `session.json` | **no** |
| `data/raw/auth-history/<id>/` | Earlier attempts of the same recordings | **no** |
| `data/raw/scans/<id>/` | Pre-sign-in scanner output (`npm run scan`), with full authorization URLs | **no** |
| `data/raw/gateways.json` | Analyzer output (`npm run analyze`) that `prepare-data` reads | **no** |
| `data/raw/flow-notes/<id>.json` | Review notes per recording (quote the tester, describe signed-in screens) | **no** |
| `data/raw/ratings.json` | The tester's scores, redirect answers and UI notes (`prepare-data` writes the public `data/ratings.json` without the notes) | **no** |
| `data/raw/feedback.json` | Notes from the local feedback box (`npm run dev`) | **no** |
| `data/raw/personal-terms.json` | Names, accounts and handles to pixelate (format: `data/personal-terms.example.json`) | **no** |
| `data/raw/flow-steps/`, `data/raw/mask-cache/`, reports | Step labels, OCR and AVIF caches, mask reports | **no** |
| everything else in `data/`, `catalog/`, `src/`, `public/` | Published or safe to publish | yes |

The scripts find these through `scripts/paths.cjs`; set `GATEWAYS_RAW_DIR=/path` to read them
from somewhere else.

## Setup

```bash
git clone https://github.com/enesozturk/mcp-consents && cd mcp-consents && npm install
```

OCR masking needs Tesseract (`brew install tesseract` / `apt-get install tesseract-ocr tesseract-ocr-eng`);
recorded videos also need `ffmpeg` (`scripts/mask-video.cjs` masks every frame before publishing).

## Adding a submitted server

1. Review the pull request or issue. `npm run check-submissions -- --probe` must pass. For an issue,
   add the entry to `catalog/extra.json` yourself.
2. Merge, pull, then:

   ```bash
   node scanner/merge.cjs catalog                 # catalog/servers.json + scan-targets.json
   npm run scan -- --only <id>                     # first screen → data/raw/scans/<id>/
   npm run analyze                                 # data/raw/gateways.json
   ```

3. Write `data/notes/<id>.json` (pre-sign-in review, see `scanner/REVIEW_BRIEF.md`).
4. `npm run prepare-data` publishes the first screen. Add the id to `data/record-todo.json`.
5. Record the signed-in flow: `npm run record -- --todo` (guide in Turkish: [kayit-araci.md](kayit-araci.md)).
   Captures land in `data/raw/auth-scans/` and stay local.
6. Write `data/raw/flow-notes/<id>.json` (`scanner/FLOW_REVIEW_BRIEF.md`), run `npm run classify-flows`,
   score it (`data/scores/<id>.json`, `scanner/SCORE_BRIEF.md`, or a tester score in
   `data/raw/ratings.json`), then `npm run prepare-data`.
7. Check `data/raw/mask-report.txt` for anything personal that was missed; add terms to
   `data/raw/personal-terms.json` and run `prepare-data` again.

## What gets published

`scripts/prepare.cjs` is the only way data reaches `src/data/gateways.json` and `public/`:

- every signed-in screenshot is OCR-masked (`scripts/mask-personal.cjs`), and every frame of a
  recorded video too (`scripts/mask-video.cjs`); anything that cannot be checked is not published
- steps with a phone number are published only with a manual mask (`data/flow-masks.json`)
- published text gets the same masking, and OAuth parameters in URLs are replaced with `…`
- the tester's notes are moved to `src/data/dev-notes.json` (git-ignored, shown only under `npm run dev`)

## Publishing changes

Only the masked output is committed: `src/data/gateways.json`, `public/auth/`, `public/shots/`,
`data/ratings.json` and the other files outside `data/raw/`. Before committing, `git status` should
show nothing under `data/raw/` (it is ignored) and `private terms`, emails or IDs should not appear in
`git diff`. Back up `data/raw/` yourself; it is not in git.

## Deploy

Cloudflare Workers builds this repository on push to `main`: build command `npm run build`, deploy
command `npx wrangler deploy`. The Worker entry is `src/server.ts` (TanStack Start plus security
headers); the custom domain is declared in `wrangler.jsonc`.
