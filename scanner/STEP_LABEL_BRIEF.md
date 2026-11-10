# Step labelling brief

You label the steps of new signed-in recordings for a gallery of MCP OAuth consent screens
(consents.ozturkenes.com). The requesting app on the screens is our test client **MCP Consents**
(sometimes still "MCP Gateways Gallery"). Nobody clicked Approve on purpose.

For each id in your batch file (one per line):

1. Read `data/raw/auth-scans/<id>/session.json`. `steps[]` lists every captured
   screen: `n`, `file` (e.g. `02.webp`), `url`, `host`, `title`.
2. Look at every step image `data/raw/auth-scans/<id>/<file>` in order.
   Ignore `*-full.webp` files.
3. Write `data/raw/flow-steps/<id>.json`:

```json
{
  "kinds": { "1": "gateway", "2": "noise", "3": "redirect" },
  "captions": { "1": "Consent with workspace picker and read/write scopes" },
  "personal_info": { "1": "email and person name" }
}
```

Kinds (one per step, every step):

- `gateway`: the provider's MCP authorization screens: consent, permission or scope choices,
  account / workspace / organization / project pickers shown as part of authorizing, a
  post-authorization "connected" screen, or an authorization error shown by the provider.
- `login`: sign-in or sign-up pages, identity-provider account choosers (Google, Microsoft, Okta),
  email codes, captchas, "verify you are human".
- `onboarding`: profile or workspace setup forms, questionnaires, terms pop-ups before consent.
- `upsell`: plans, trials, app downloads.
- `redirect`: the page after the browser left the provider (`localhost:33418` callback page) or
  a marketing site.
- `noise`: blank pages, spinners, and repeats. A repeat is a screen that looks the same as an
  earlier step. Keep the first, mark later copies `noise`. A screen where an option was changed
  (a toggle, a selected workspace, an expanded section) is not a repeat: keep it as `gateway`.

Captions: only for steps that are not `noise`, at most 10 words, describing what the screen shows
(not what the person did). Personal info: list the steps that show a person's name, an email
address, a phone number, a membership or account number, or a workspace / organization name that
contains a person's name, with a short description. Leave a step out if it shows none.

Do not edit any other file. When done, reply with one line per id: the kinds in order
(e.g. `stripe: gateway gateway noise gateway redirect`).
