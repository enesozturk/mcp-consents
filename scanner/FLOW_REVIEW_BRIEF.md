# Signed-in flow review brief

You are writing notes for a public gallery of MCP OAuth gateways (consents.ozturkenes.com).
For each gateway in your batch, a person signed in by hand (usually with Google) and a
recorder captured every screen until the consent step. The requesting app is named
**MCP Consents** (not Claude). Nobody was supposed to click Approve; when a flow
"returned to client", the browser was sent back to `localhost:33418`, which is our
recorder, not the provider.

For each id in your batch:

1. Read `data/raw/auth-scans/<id>/session.json`. It lists the steps
   (`file`, `full_page`, `url`, `title`), `returned_to_client`, and the person's `note`
   (written while recording; treat it as first-hand observation, e.g. "requires work email",
   "requires phone", "desktop app").
2. Read every step image `data/raw/auth-scans/<id>/<NN>.webp` in order.
   Read `<NN>-full.webp` only if the viewport image cuts off something important.
3. Write `data/raw/flow-notes/<id>.json`:

```json
{
  "summary": "2-4 plain sentences describing what happens after sign-in, in order.",
  "features": ["tags from the list below that this flow shows"],
  "captions": { "1": "short caption for step 1", "2": "..." },
  "personal_info": { "3": "what is visible, e.g. 'email address', 'person name', 'workspace name'" },
  "drop_steps": [ ]
}
```

Rules:
- `features`, pick only what the screenshots or the note show:
  `account_picker` (choose an existing account/org/workspace), `workspace_created`
  (a workspace/org was created automatically), `onboarding` (signup questions, profile
  setup, survey), `consent_screen` (an approve/deny page for the requesting app),
  `scope_list` (itemised permissions), `permission_toggles` (user can choose permissions or
  access level), `resource_picker` (choose specific projects/pages/files), `work_email_required`,
  `phone_required`, `paid_plan_required`, `desktop_app_required`, `signup_blocked`
  (could not create an account), `error` (flow ends in an error), `no_consent`
  (returns to the client without any consent screen), `mentions_claude` (the page refers to
  Claude even though the client was MCP Consents), `marketing_upsell`,
  `redirect_kept` (after sign-up/onboarding the provider took the person back to the
  authorization/consent step), `redirect_lost` (after sign-up/onboarding the provider dropped
  the authorization request and left the person in its app; the note often says
  "forgets the redirection").
- `captions`: one per step, max ~8 words, describing the screen ("Google account chooser",
  "Pick a workspace", "Consent with read/write scopes"). Every step gets a caption.
- `personal_info`: list every step whose screenshot shows a real person's email address,
  full name, phone number, or a workspace/organisation name derived from a person's name.
  Generic placeholders ("you@company.com") do not count. Omit the field if none.
- `drop_steps`: steps that add nothing (blank page, loading spinner, exact duplicate of the
  previous step, cookie banner covering everything). Omit if none.
- `summary`: concrete, specific, for designers and developers comparing OAuth UX. Mention the
  person's note when it adds information (e.g. that a work email was required). No filler,
  no guesses beyond what is visible. Do not mention that you are an AI or that you looked at
  screenshots.

Write each file with the Write tool. Do not modify any other files. When done, reply with one
line per id: `<id>: <features joined by comma> | personal_info steps: <list or none>`.
