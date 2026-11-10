# Gateway review brief

You are writing experience notes for a public gallery of MCP OAuth "gateway" screens
(consents.ozturkenes.com). Each gateway is the first page a user sees after clicking
"Connect" on a remote MCP server. Our capture client was named **MCP Consents**,
so where a consent screen names the requesting app, it says "MCP Consents"
instead of "Claude". Nothing was signed in or approved.

For each id in your batch:

1. Read `data/raw/scans/<id>/gateway-light.png` (1440×900 viewport at 2×).
   If `gateway-mobile.png` exists and the desktop shot is unclear, you may also read it.
2. Read the facts for that id from `data/raw/gateways.json` (fields
   `landing.host`, `landing.title`, `landing.text_excerpt`, `landing.hops`, `oauth.scopes`,
   `landing.idp`). Use them, but trust the screenshot over the text heuristics.
3. Write `data/notes/<id>.json`:

```json
{
  "first_screen": "consent | login | consent_then_login | account_picker | bot_challenge | error_page | blank | other",
  "sign_in_methods": ["google", "github", "microsoft", "apple", "sso", "passkey", "magic_link", "password"],
  "permissions": "none | summary | list | toggles",
  "names_client": true,
  "highlights": ["2-4 short tags, e.g. 'Scope toggles', 'Split-screen hero', 'Third-party IdP', 'Shows redirect URI', 'Dark UI', 'Cookie banner', 'Unbranded'"],
  "notes": "2-4 plain sentences."
}
```

Field rules:
- `first_screen`: what the screenshot actually shows. `consent` = an approve/deny page
  with no sign-in form. `consent_then_login` = consent info and sign-in on one page.
  `account_picker` = choose an account/workspace/org. `error_page` = any OAuth or app error.
- `sign_in_methods`: only methods visibly offered on screen (buttons or fields). Email +
  password field = `password`; email-only field with "continue"/"send code" = `magic_link`.
  Empty array if none.
- `permissions`: `none` if no permissions are described; `summary` = one line like
  "Read and write access"; `list` = itemised permissions; `toggles` = user can tick/untick.
- `names_client`: true if the page shows the requesting app's name (MCP Consents).
- `notes`: concrete and specific to this screen, written for designers and developers
  comparing OAuth UX. Cover what the user sees first, the layout and branding, what it
  tells the user about the requesting app or permissions, and anything notable (friction,
  warnings, third-party identity provider, error messages, redirect hops). No marketing
  language, no filler like "clean and modern", no guesses about screens after sign-in.
  Do not mention that you are an AI or that you reviewed a screenshot.

Write each file with the Write tool. Do not modify any other files. When you finish,
reply with one line per id: `<id>: <first_screen>` and flag any you could not review.
