---
name: mcp-oauth-consent
description: Design, build or review the OAuth consent flow of a remote MCP server, meaning sign-in, account and workspace selection, consent with configurable permissions, the redirect URL and the post-authorization screen. Uses the criteria behind consents.ozturkenes.com, a ranked gallery of real MCP consent screens. Use when building or improving an MCP server's OAuth flow or consent page, or when asked how good an existing one is.
---

# MCP OAuth consent flow

When someone connects a remote MCP server to an AI client (Claude, ChatGPT, Cursor, an IDE), the
client opens the server's authorization URL in a browser. Everything the person sees from that
moment until they are sent back to the client is the **consent flow**: sign-in, account or workspace
selection, the consent screen and the page after approval.

The consent flow is the only moment the person decides what an AI agent may do with their account.
A good consent flow makes that decision easy and safe. This skill helps you audit a consent flow, score it,
and rewrite it so it meets the bar set by the best consent screens in the gallery at
https://consents.ozturkenes.com.

## How to use this skill

1. **Find the flow** in the codebase (see "Where the consent flow lives" below).
2. **Audit** the current consent flow against the criteria and score it with the rubric. If you can
   run it, go through it once as a new user and once as an existing user, and note every screen.
3. **Plan** the changes, most important first (the criteria are in order of weight).
4. **Implement** the consent screen, the data it needs and the server-side enforcement.
5. **Verify** end to end with a real MCP client (see "Verify").
6. **Report**: the score before and after, what changed, and anything left open.

If the person only asks for a review, stop after step 2 and give the score, the reasons and a
prioritized list of changes.

## The criteria, in order of weight

### 1. Account and workspace: show it, and let people choose

Missing account context is the most common failure. The person must know **which account** and
**which workspace, organization, team or project** the agent will act in, and be able to change it
on the consent screen.

- Show the signed-in identity ("Signed in as jane@acme.com") with a **Switch account** action that
  keeps the authorization request alive.
- If the product has workspaces, organizations, teams, projects, stores or ad accounts, show a
  **picker** on the consent screen. Let people choose one, several or all, whichever the product
  supports, and preselect the obvious choice when there is only one.
- If the person has no workspace yet, create one automatically or in a short step, then come back
  to the consent screen. Do not drop them in the product's dashboard.
- Bind the grant to the selected account and workspaces on the server. The token must not reach
  anything that was not selected.

### 2. Permissions: show them in plain language, and let people configure them

- List what the client will be able to do, grouped by resource ("Campaigns", "Issues",
  "Payments"), in plain language, with **read** and **write** clearly separated.
- Offer presets (**Read only**, **Read and write**) and a **Customize** option for per-resource
  or per-permission choices. The best consent screens let people set no access / read / write per
  resource.
- Default to the least privilege that still makes the integration useful. Never default to
  "full access" when read-only would do.
- Describe consequences, not scope strings: "Make the changes you ask for: budgets, statuses and
  ads", not `ads:write`. Show the raw scopes only as secondary detail.
- A single line such as "This app will have full access to your account" is the weakest possible
  form. It counts as almost nothing.

### 3. Redirect URL: show where access goes

- Show the **exact redirect URI** the authorization code will be sent to
  (`http://localhost:33418/callback`, `https://claude.ai/api/mcp/auth_callback`).
- Show whether the client is **verified**. For an unverified client or a loopback redirect, show a
  clear warning and require an explicit "I recognize and trust this URL" checkbox before Approve
  becomes active.
- This is a security control: it is how a person notices a phishing client that borrowed a
  trusted name.

### 4. Client identity

- Show the requesting client's **name** and **logo** next to your own logo (for example
  `[client logo] ⇄ [your logo]`), and its website when it is known.
- Use what the client registered (dynamic client registration `client_name`, `logo_uri`,
  `client_uri`, or the client ID metadata document). If there is no logo, show a neutral initial,
  not a broken image.
- Mark clients you have not verified as **Unverified**, without blocking them.

### 5. A tidy, considered UI

This criterion weighs about as much as permissions. Judge it as a careful product designer would.

- One compact card. The essentials (client, account, workspace, permissions, redirect, actions)
  fit without scrolling on a laptop screen.
- Clear hierarchy: title ("Connect Claude to Acme"), one line of explanation, then sections with
  small uppercase labels (ACCOUNT, PERMISSIONS, WORKSPACES, REDIRECT URL).
- Your brand is present but quiet: logo, colors and type are deliberate, not a default OAuth
  template or an unstyled form.
- One primary action (**Approve** or **Allow**) and a secondary **Cancel** or **Deny**. Approve is
  disabled until required choices are made, with the reason visible.
- Works at phone width, in dark mode if the product has one, with the keyboard and with a screen
  reader (labels on toggles and pickers).
- Nothing covers the card: no cookie banner on top of the consent, no chat widget, no modal.

### 6. Flow continuity and the post-authorization screen

- Sign-up, email verification and onboarding must **return to the consent screen**. Losing the
  authorization request after onboarding is a serious failure.
- After approval, show a short **post-authorization screen** ("Claude is connected"): what was
  connected, a countdown back to the client and a **Continue** button that works if the automatic
  redirect does not.
- Tell people how to change or revoke access later, and make that page exist (a list of connected
  clients with their permissions and a Revoke button).

## Anti-patterns

Each of these caps the score. The first two mean 0 to 1.

- **No consent screen at all**: the browser is sent straight back to the client after sign-in.
  People cannot see or limit what they grant.
- **An error page** as the only screen, or an error with no explanation.
- A default framework OAuth template with no account, workspace or permission detail.
- "Full access" as the only permission statement.
- Losing the authorization request after sign-up or onboarding.
- Dead ends before consent: a work email required with no explanation, a desktop app that must be
  installed, a phone number for sign-up, or a paywall before the person can even see what they
  would grant.
- An account picker that cannot be changed afterwards. If people pick the account first and the
  permissions second, they need a way back to the account step.

## Scoring rubric (0 to 5, one decimal)

| Criterion | Best | Good | Weak |
| --- | --- | --- | --- |
| Account | picker or switch, workspace picker | account shown | none |
| Permissions | configurable per resource | listed | summary or none |
| Redirect | exact URI shown, unverified warning | warning only | none |
| Client identity | name and logo | name | none |
| UI | polished | ok | weak or broken |
| Brand | strong | ok | weak |

- **4.5 to 5**: every criterion at its best, and the UI is beautiful and calm.
- **4 to 4.5**: complete, with one gap (for example no workspace picker, or permissions listed but
  not configurable).
- **3 to 4**: account and permissions shown but little control, or a generic UI.
- **2 to 3**: missing account context or permissions, cluttered or confusing.
- **0 to 2**: an anti-pattern above.

For reference, look at the top of the ranking and compare screen by screen:

- Ranked list as markdown: https://consents.ozturkenes.com/api/gateways?min_score=4.5&format=md
- Consent screens with configurable permissions: https://consents.ozturkenes.com/api/gateways?permissions=configurable&format=md
- One server with screenshots: https://consents.ozturkenes.com/api/gateways/stripe?format=md

## Consent screen anatomy

Use this as the layout to build towards. Adapt the labels to the product.

```
┌──────────────────────────────────────────────┐
│        [client logo]  ⇄  [your logo]          │
│        Connect {Client} to {Product}          │
│  {Client} is asking to access your {things}.  │
│  ┌──────────────────────────────────────────┐ │
│  │ Signed in as jane@acme.com  Switch account│ │
│  └──────────────────────────────────────────┘ │
│  PERMISSIONS          [Read only|Read & write]│
│   ◉ Read campaigns, metrics and reports       │
│   ✎ Make the changes you ask for              │
│   Customize ›                                 │
│  WORKSPACES                    [All | Select]  │
│   [Acme Inc. ✓] [Wayne Co.]                    │
│  REDIRECT URL                 ⚠ Unverified app │
│   http://localhost:33418/callback              │
│   ☐ I recognize and trust this URL             │
│  [ Cancel ]                       [ Approve ]  │
│  Change or revoke access any time in Settings. │
└──────────────────────────────────────────────┘
```

After Approve: "{Client} is connected", the connected workspaces, "Taking you back to {client}" with
a short countdown and a Continue button.

## Protocol checklist (MCP authorization)

The screens only work if the protocol underneath is right. Check these while you are in the code.

- **401 with discovery**: an unauthenticated MCP request returns `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://…/.well-known/oauth-protected-resource…"`.
- **Protected resource metadata** (RFC 9728) lists `authorization_servers` and `scopes_supported`.
- **Authorization server metadata** (RFC 8414, `/.well-known/oauth-authorization-server`) lists the
  authorize, token and registration endpoints and `code_challenge_methods_supported: ["S256"]`.
- **Client registration**: support dynamic client registration (RFC 7591) and/or client ID
  metadata documents, so any MCP client can connect without manual setup. Store `client_name`,
  `logo_uri` and `client_uri` for the consent screen.
- **PKCE with S256** is required. Reject requests without a code challenge.
- **Redirect URIs** must match exactly what was registered. Allow loopback redirects
  (`http://localhost:<port>`, `http://127.0.0.1:<port>`) for local clients, and label them on the
  consent screen.
- **Resource indicators** (RFC 8707): honor the `resource` parameter and issue tokens whose audience
  is this MCP server only.
- **Grant enforcement**: the token carries exactly the chosen scopes, account and workspaces, and
  every MCP tool checks them. A read-only grant must make write tools fail with a clear message.
- **Persist consent** per client and user, show it on a connected-apps page, and let people revoke
  it. Rotate refresh tokens.
- **Keep the request** (client, redirect, PKCE challenge, scopes, state, resource) across sign-in,
  sign-up and onboarding, for example in a signed short-lived cookie or server-side session, and
  resume the consent screen afterwards.

## Where the consent flow lives

Look for these in the codebase:

- Routes for `/authorize`, `/oauth/authorize`, `/consent`, `/oauth/register`, `/token`.
- Handlers for `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
- An OAuth provider library (for example `@cloudflare/workers-oauth-provider`, `oidc-provider`,
  Better Auth, Auth.js, Clerk, Stytch, WorkOS, Supabase Auth, Ory Hydra, Keycloak, Spring
  Authorization Server, Django OAuth Toolkit) and where it renders or redirects to the consent page.
- The sign-in and onboarding pages, and how they redirect back after success.

## Verify

- Connect with a real client (Claude, the MCP Inspector, or `npx mcp-remote <url>`). Go through the
  flow as a brand-new user and as an existing user with two workspaces.
- Check that Switch account and the workspace picker keep the request alive.
- Try read-only, then call a write tool: it must be refused.
- Check the redirect URL and the unverified warning with a loopback client.
- Check phone width, dark mode, keyboard and screen reader labels.
- Revoke the client from the connected-apps page and confirm the token stops working.

## Copy guidelines

- Title: "Connect {Client} to {Product}". Subtitle: what the client will be able to reach.
- Permissions describe outcomes in the person's words, not scope names.
- Warnings are specific: "{Product} can't verify where access goes. Approve only if you trust the
  app that opened this page."
- Buttons are verbs: Approve, Cancel. No "OK".
- End with how to change it later: "Change the access level or disconnect any time in Settings."
