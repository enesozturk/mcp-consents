#!/usr/bin/env node
// Seeds data/raw/ratings.json from what is already known, without overwriting anything the tester set:
//   redirect_after_onboarding  from the tester's note ("redirected after onboarding" / "forgets the
//                              redirection") or the flow review tags redirect_kept / redirect_lost
//   ui_feedback                the tester's note, when it talks about the UI or the redirect
// ui_rating is never guessed; the tester sets it (recorder prompt or by hand).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('./paths.cjs');
P.requirePrivate('seed-ratings');
const AUTH = P.AUTH;
const NOTES = P.FLOW_NOTES;
const FILE = P.RATINGS;

const ratings = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const LOST = /forget|forgot|lost|loses|doesn'?t redirect|not redirect|no redirect/i;
const KEPT = /redirected after|mcp redirection|redirect(ed)? (back|to (the )?mcp)|returned to (the )?(mcp|gateway|consent)/i;
const UI = /\bui\b|design|onboarding|redirect/i;
let added = 0;
for (const id of fs.readdirSync(AUTH).sort()) {
  const sf = path.join(AUTH, id, 'session.json');
  if (!fs.existsSync(sf)) continue;
  const s = JSON.parse(fs.readFileSync(sf, 'utf8'));
  const nf = path.join(NOTES, `${id}.json`);
  const features = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, 'utf8')).features || [] : [];
  const note = s.note || '';
  const r = { ...(ratings[id] || {}) };
  if (!r.redirect_after_onboarding) {
    const v = LOST.test(note) ? 'lost' : KEPT.test(note) ? 'kept'
      : features.includes('redirect_lost') ? 'lost' : features.includes('redirect_kept') ? 'kept' : null;
    if (v) r.redirect_after_onboarding = v;
  }
  if (!r.ui_feedback && note && UI.test(note)) r.ui_feedback = note;
  if (JSON.stringify(r) !== JSON.stringify(ratings[id] || {})) { ratings[id] = r; added++; }
}
fs.writeFileSync(FILE, JSON.stringify(ratings, null, 2) + '\n');
console.log(`updated ${added} entries; ${Object.keys(ratings).length} in data/raw/ratings.json`);
for (const [id, r] of Object.entries(ratings)) console.log(`  ${id}: ${r.redirect_after_onboarding || '-'}${r.ui_rating ? ` · ${r.ui_rating}/5` : ''}${r.ui_feedback ? ` · "${r.ui_feedback}"` : ''}`);
