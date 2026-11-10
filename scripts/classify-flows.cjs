#!/usr/bin/env node
// Labels every recorded step with a kind instead of deleting anything:
//   gateway    consent, scopes, permission choices, account/workspace/resource pickers, gateway errors
//   login      sign-in / sign-up pages, account choosers, verification, login errors
//   onboarding sign-up forms, profile and workspace setup, questionnaires, terms
//   upsell     trials, plan offers, app downloads pitched before consent
//   redirect   pages after the browser left the provider (back to the recorder, marketing site)
//   noise      blank pages, spinners, unchanged repeats (kept in the repo, not shown)
//
// Uses the review captions in data/raw/flow-notes/<id>.json plus overrides in
// data/flow-kind-overrides.json ({ "<id>:<n>": "<kind>" }). Writes data/flow-kinds.json.
// A recording is complete when it reached a gateway screen or returned to the client;
// incomplete ones are queued again by `npm run record`.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const P = require('./paths.cjs');
P.requirePrivate('classify-flows');
const AUTH = P.AUTH;
const NOTES = P.FLOW_NOTES;
const OVR = path.join(ROOT, 'data/flow-kind-overrides.json');
const OUT = path.join(ROOT, 'data/flow-kinds.json');

const GATEWAY = /consent|authori[sz]|scope|permission|picker|selector|customi[sz]e access|access with|access:|return to your tool|requested scope/i;
const GATEWAY_WORDS = /consent|authori[sz]|scope|permission/i;
const NOT_GATEWAY = /log ?in|sign[ -]?in|sign[ -]?up|create account|onboarding|upsell|trial|offer|spinner|loading|blank|returned to client|recorder page|immediate return|redirected|terms popup|username|create organization|create a project|name your team|invite|questionnaire|survey|preferences|download|desktop|verification|captcha|sms|validation|password|welcome|marketing|choose bot|automate|personal vs work|new user|details form|prompt to connect|are you sure|setup commands|work email|company email|not enabled|not linked|unknown user/i;
const NOISE = /spinner|loading|blank page|unchanged|\(repeat\)|same .* page|duplicate/i;
const REDIRECT = /returned to client|recorder page|immediate return|redirected/i;
const UPSELL = /upsell|trial|offer|plan\b|download|desktop app/i;
const LOGIN = /log ?in|sign[ -]?in|sign[ -]?up|password|verification|captcha|sms|otp|unknown user|not linked|not enabled|work email|company email|personal email|validation|google|sso|register/i;

const overrides = fs.existsSync(OVR) ? JSON.parse(fs.readFileSync(OVR, 'utf8')) : {};

function kindOf(id, st, notes) {
  // kinds set by a reviewer looking at the screens win (data/raw/flow-notes/<id>.json "kinds")
  if (notes.kinds?.[st.n]) return notes.kinds[st.n];
  const o = overrides[`${id}:${st.n}`];
  if (o) return o;
  const cap = notes.captions?.[st.n] || '';
  if ((notes.drop_steps || []).map(Number).includes(st.n) || NOISE.test(cap)) return 'noise';
  if (st.host === 'localhost:33418' || REDIRECT.test(cap)) return 'redirect';
  if (GATEWAY.test(cap) && !(NOT_GATEWAY.test(cap) && !GATEWAY_WORDS.test(cap))) return 'gateway';
  if (UPSELL.test(cap)) return 'upsell';
  if (LOGIN.test(cap)) return 'login';
  return 'onboarding';
}

const out = {};
const tally = {};
for (const id of fs.readdirSync(AUTH).sort()) {
  const sf = path.join(AUTH, id, 'session.json');
  if (!fs.existsSync(sf)) continue;
  const s = JSON.parse(fs.readFileSync(sf, 'utf8'));
  const nf = path.join(NOTES, `${id}.json`);
  if (!fs.existsSync(nf) && s.steps.length) { console.log(`${id}: not reviewed yet`); continue; }
  const notes = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, 'utf8')) : {};
  const kinds = {};
  for (const st of s.steps) { const k = kindOf(id, st, notes); kinds[st.n] = k; tally[k] = (tally[k] || 0) + 1; }
  const gateway = Object.values(kinds).filter((k) => k === 'gateway').length;
  out[id] = { recorded_at: s.recorded_at, complete: gateway > 0 || !!s.returned_to_client, gateway, kinds };
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
const incomplete = Object.entries(out).filter(([, v]) => !v.complete).map(([k]) => k);
console.log('kinds', tally);
console.log(`${Object.keys(out).length} recordings, ${incomplete.length} incomplete: ${incomplete.join(' ')}`);
