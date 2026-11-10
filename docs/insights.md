# Cross-gateway observations

Notes that apply across services rather than to one gateway. Add to this list while recording;
it feeds the site's overview later.

- **One MCP server per product.** Some providers ship a separate MCP server for each product
  (You.com: main, Finance, Research; Mapbox: main and DevKit; Zoom: one per app). The gateway is
  the same, so the gallery keeps one entry per provider.
- **Returning to the authorization after onboarding.** New accounts often go through sign-up and
  onboarding first. Some providers bring the user back to the MCP consent step afterwards
  (Prisma, Railway, Process Street, Sanity), others drop the request and leave the user in their
  app (Resend, Otter, Contentsquare, Val Town). Recorded per gateway in the private ratings file.
- **Silent rejection.** A few servers send the browser straight back to the client with
  `access_denied` and no screen at all (New Relic, Greptile).
- **Work email walls.** Many sales and analytics tools refuse personal Google accounts before any
  gateway appears.
