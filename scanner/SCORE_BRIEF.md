# Gateway scoring brief

You score MCP OAuth gateway screens for a public gallery (consents.ozturkenes.com), on the
tester's scale, so the gallery can be ranked. The requesting app is our test client
**MCP Consents** (not Claude). Personal names and emails are partly pixelated on purpose;
a pixelated account or workspace name still counts as "the account is shown".

## The tester's criteria (from their own feedback)

Score 0-5 with one decimal. The tester's own summary: *the brand is presented well, the
permissions to be granted are shown, they can be configured, the account / workspace /
organisation is shown (depending on the app), the interface has a tidy, good-looking UI flow,
and the redirect URL is shown (important for security).* The UI-flow judgement is personal
taste: clean, considered, aesthetic screens like **Linear** and **Prisma** deserve clearly
higher scores than generic or cluttered ones with the same information.

What the tester rewards, in rough order of weight:

1. **Which account / workspace / org is being connected** is shown, ideally with a picker
   or a switch-account option. Missing account context is the most common complaint.
2. **Permissions are shown**: what the app can do, read vs write, per feature or resource.
   Best: the user can **configure** them (toggles, read-only, per-project / per-resource
   choices). A single vague line ("full access") is weak; a list is good; configurable is best.
3. **The redirect URL / destination is shown** (security). A warning about an unverified or
   local app helps, but showing the actual redirect is better.
4. **Client identity**: the requesting app's name (and logo slot) is shown clearly.
5. **UI flow and aesthetics** (weighted about as much as permissions): clear, compact,
   polished; typography, spacing and brand presentation feel deliberate; no scrolling needed to
   see the essentials; not broken. A beautiful, minimal page in the spirit of Linear or Prisma
   can reach 4+ even with fewer details; a generic framework page (default OAuth templates,
   unstyled forms) should rarely pass 3.5 however much it lists. Cramped, broken or cluttered
   pages lose points.
6. **Brand presentation**: the provider's logo and identity are shown well, next to the
   requesting app's name/logo slot.

No UI at all (the browser is sent straight back without any consent screen) scores **0**:
"no UI? it's essential". A page that only shows an error scores 0.5-1.

## Calibration: the current ranking

Treat these as the anchors (scores as published on the site):

- **4.8 Stripe**: account picker, environment picker, permissions that can be customized per resource, and
  a post-authorization screen. The most complete flow; first.
- **4.7 Adstudio**: one calm card with the account and a switch, read only / read & write, a workspace
  picker and the exact redirect URL; below Stripe because permissions cannot be chosen per resource.
- **4.7 PostHog**: per-product no access / read / write and an organization / project selector; the
  account cannot be switched on the consent screen.
- **4.7 Prisma**: genuinely beautiful; permissions are not configurable, which matters little here.
- **4.6 Cloudflare, Expo, Notion**: complete and tidy. Cloudflare does not let you pick an account;
  Notion does everything well (it even creates the workspace) but its UI is very plain.
- **4.5 Intercom, Lumin, Resend**: Resend is polished and configurable but loses the authorization after
  onboarding, so it stays below flows that get every criterion right.
- **4.4 Railway, Clerk** (Clerk shows the localhost redirect).
- **4.1 Appwrite**: configurable per feature with account and org settings, but no redirect URL, long
  sections and an uncomfortable flow.
- **4.1 Clarify, 4.0 Base44, 3.9 Circleback, 3.9 Wix** (creative backgrounds), **3.8 Carta**,
  **3.3 CB Insights**.
- **2.2 Airwallex, Amplitude**: not enough context (no account, no access details).
- **0**: no consent screen at all (the browser goes straight back to the client).

Ties are ordered by the tester's `tiebreak` in data/ratings.json.

Be opinionated, like the tester: spread the scores out, reserve 4.5+ for gateways that are both complete
and beautiful, and do not hesitate to score a generic, cluttered or confusing gateway in the 2s even when
it technically lists permissions. Ties are fine, but avoid bunching everything between 3 and 4.

## Task

For each id in your batch file (one per line):

1. Read its entry in `data/score-manifest.json` (name, images, source,
   summaries, tester note).
2. Read every listed image (paths are relative to ``). If `images` is empty
   and the source says it returned straight to the client, the score is 0.
3. Write `data/scores/<id>.json`:

```json
{
  "score": 3.4,
  "criteria": {
    "account": "shown | picker | none",
    "permissions": "configurable | list | summary | none",
    "redirect": "shown | warning_only | none",
    "client_identity": "name_and_logo | name | none",
    "ui": "polished | ok | weak | broken",
    "brand": "strong | ok | weak"
  },
  "reason": "One or two plain sentences in the tester's spirit: what it shows, what is missing."
}
```

Be consistent across your batch: compare against the calibration list, not against each other
only. Do not edit any other files. When done, reply with one line per id: `<id>: <score>`.
