// Where the pipeline reads and writes. Raw material (unmasked signed-in recordings and videos, scan
// output, the masking term list, review notes and the tester's own notes) lives in data/raw/,
// which git ignores: it stays on the maintainer's machine. Everything else in data/ is public.
// Set GATEWAYS_RAW_DIR to keep the raw folder somewhere else.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = process.env.GATEWAYS_RAW_DIR ? path.resolve(process.env.GATEWAYS_RAW_DIR) : path.join(ROOT, 'data/raw');

const P = {
  ROOT,
  RAW_DIR,
  AUTH: path.join(RAW_DIR, 'auth-scans'), // signed-in recordings (npm run record)
  HISTORY: path.join(RAW_DIR, 'auth-history'), // earlier attempts of the same recordings
  FLOW_NOTES: path.join(RAW_DIR, 'flow-notes'), // review notes per recording
  FLOW_STEPS: path.join(RAW_DIR, 'flow-steps'), // step labels for re-recordings
  SCANS: path.join(RAW_DIR, 'scans'), // pre-sign-in scanner output (npm run scan)
  RAW: path.join(RAW_DIR, 'gateways.json'), // analyzer output (npm run analyze)
  RATINGS: path.join(RAW_DIR, 'ratings.json'), // tester's scores, answers and notes (private)
  RATINGS_PUBLIC: path.join(ROOT, 'data/ratings.json'), // the same without notes (public)
  FEEDBACK: path.join(RAW_DIR, 'feedback.json'), // tester's notes from the local feedback box
  TERMS: path.join(RAW_DIR, 'personal-terms.json'), // names and accounts to pixelate
  TERMS_EXAMPLE: path.join(ROOT, 'data/personal-terms.example.json'),
  MASK_CACHE: path.join(RAW_DIR, 'mask-cache'),
  REPORTS: RAW_DIR, // mask-report.txt, hidden-personal.txt
};

// Scripts that rebuild published data from raw recordings need them; say so plainly.
P.requirePrivate = (what) => {
  if (fs.existsSync(P.AUTH) && fs.existsSync(P.RAW)) return;
  console.error(`${what} needs the raw recordings and scan output in ${path.relative(ROOT, P.RAW_DIR) || '.'}/ (see docs/MAINTAINING.md).`);
  console.error('The published data in src/data/ and public/ is already built; npm run dev and npm run build work without it.');
  process.exit(1);
};

module.exports = P;
