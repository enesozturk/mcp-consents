#!/usr/bin/env node
// Folds step labels from data/raw/flow-steps/<id>.json (written by reviewers following
// scanner/STEP_LABEL_BRIEF.md after a re-recording) into data/raw/flow-notes/<id>.json: kinds,
// captions, personal info and drop_steps are replaced; summary, features and every other note
// stay as they were. Stale kind overrides for those ids are removed. Then run classify-flows.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('./paths.cjs');
const STEPS = P.FLOW_STEPS;
const NOTES = P.FLOW_NOTES;
const OVR = path.join(ROOT, 'data/flow-kind-overrides.json');
const overrides = JSON.parse(fs.readFileSync(OVR, 'utf8'));
let n = 0;
for (const f of fs.readdirSync(STEPS).filter((x) => x.endsWith('.json'))) {
  const id = f.replace(/\.json$/, '');
  const st = JSON.parse(fs.readFileSync(path.join(STEPS, f), 'utf8'));
  const nf = path.join(NOTES, `${id}.json`);
  const notes = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, 'utf8')) : {};
  notes.kinds = st.kinds || {};
  notes.captions = st.captions || {};
  notes.personal_info = st.personal_info || {};
  notes.drop_steps = Object.entries(notes.kinds).filter(([, k]) => k === 'noise').map(([k]) => Number(k));
  fs.writeFileSync(nf, JSON.stringify(notes, null, 2) + '\n');
  for (const k of Object.keys(overrides)) if (k.startsWith(`${id}:`)) delete overrides[k];
  n++;
}
fs.writeFileSync(OVR, JSON.stringify(overrides, null, 2) + '\n');
console.log(`merged step labels for ${n} recording(s)`);
