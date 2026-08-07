# disputes.matt-schober.com

Public **Legal Disputes Portal** for the Matt Schober brand — a transparent,
static record of legal matters and disputes.

The site is generated **at build time** from HubSpot and published to GitHub
Pages. There is **no client-side API access**: the HubSpot token stays on the
build server (injected by [Doppler](https://www.doppler.com/)), and the browser
only ever sees pre-rendered HTML. This keeps a private API token off a public
website while still driving the page from live CRM data.

```
HubSpot (Deals ▸ Disputes pipeline) ──▶ GitHub Actions ──▶ node scripts/build.mjs ──▶ dist/ ──▶ Pages
                                          │  (Doppler injects HUBSPOT_SERVICE_KEY)
                                          └─ runs on push to main, daily cron, or manual dispatch
```

---

## ⚠️ This is a PUBLIC website — read before adding real matters

`disputes.matt-schober.com` is served publicly. Anything the build publishes is
world-readable and may be cached or indexed by search engines long after it is
removed here. Matters in this portal are captioned `Party A vs. Party B` and
**name private individuals**, so treat every publication default as a decision
with real consequences for people who did not opt in.

**Controls built in to limit exposure:**

| Control | Env var | Default | Effect |
| --- | --- | --- | --- |
| Pipeline restriction | *(code)* | on | **Primary gate.** Only deals in the Disputes pipeline are eligible. Enforced server-side in the HubSpot query *and* again locally in `enforcePipeline()`, so the consulting pipeline can never reach the site even if the query filter breaks. |
| Publication marker gate | `PUBLISH_REQUIRE_MARKER` | `false` | Optional second gate. When `true`, only deals whose marker property equals the marker value are published. |
| Marker property / value | `PUBLISH_MARKER_PROPERTY` / `PUBLISH_MARKER_VALUE` | `publish_to_portal` / `true` | Which HubSpot property opts a deal in. The property must exist on Deals first — filtering on a missing property makes the Search API return `400`. |
| Publish descriptions | `PUBLISH_DESCRIPTIONS` | `false` | Deal descriptions here are internal working notes, not public copy. Off by default. |
| Publish amounts | `PUBLISH_AMOUNTS` | `false` | Off by default — a dollar figure next to a name reads as a judgment owed. |
| Public reference numbers | `REFERENCE_PREFIX` | `MS` | Cards show a derived reference (e.g. `MS-681101`), never the raw HubSpot record id. |

`Closed Won` and `Closed Lost` are both relabelled to a neutral **Closed** on the
public page; the win/loss distinction stays in HubSpot. Badge colour still
derives from the real stage.

---

## Data model

Disputes are modelled on HubSpot **Deals** (object `0-3`). A deal is
"classified as a dispute" by living in the **Disputes** pipeline (id `default`)
of portal `244055979`. The portal's other pipeline —
`1310445295`, "Consulting Project Opportunities" — holds recruiting and
consulting leads and is **never** published.

| Portal card | HubSpot property |
| --- | --- |
| Status badge | `dealstage` (live stage labels fetched at build time) |
| Title | `dealname` (the case caption) |
| Description | `description`, HTML stripped — withheld unless `PUBLISH_DESCRIPTIONS=true` |
| Amount at Issue | `amount` — withheld unless `PUBLISH_AMOUNTS=true` |
| Opened | `createdate` (when the record was created in the CRM, which may differ from the filing date) |
| Last Updated | `hs_lastmodifieddate` |
| Closed | `closedate`, shown only on closed matters |

Disputes-pipeline stages map to semantic states that drive badge colour:

| Stage | State |
| --- | --- |
| Dispute Identified | `open` |
| Communications Sent · Court Active · Post Court | `active` |
| Hold | `waiting` |
| Closed Won · Closed Lost | `closed` |

Renaming or adding stages keeps working: the build falls back to matching stage
labels by keyword (`stateForStageLabel`).

---

## Local development

No dependencies are required to build (Node ≥ 20, native `fetch`).

```bash
# Build from sample data (no credentials needed) and preview:
node scripts/build.mjs      # or: npm run build
npm run serve               # http://localhost:8080

# Build from live HubSpot data via Doppler:
doppler setup               # select project + config (see doppler.yaml)
doppler run -- npm run build
```

When `HUBSPOT_SERVICE_KEY` is absent, the build falls back to
[`mock/disputes.sample.json`](mock/disputes.sample.json) so the site is always
buildable and previewable. Every party in that file is fictional — real matters
live only in HubSpot and are never committed to this repo.

In CI, the sample-data fallback is allowed **only on pull requests** (which never
deploy). On `main`, cron, or manual runs a missing `DOPPLER_TOKEN` fails the
build rather than publishing placeholder matters to the live site.

---

## Deployment setup (one-time)

1. **HubSpot** — create a Private App with the `crm.objects.deals.read` scope
   (add `crm.pipelines.read` for live stage labels) and copy its access token.
   It must be a **Private App token from portal 244055979** — a developer API
   key cannot read CRM records and will fail with `MISSING_SCOPES`.
2. **Doppler** — in project `disputes-matt-schober-com` / config `prd`, add a
   secret `HUBSPOT_SERVICE_KEY` with that value. Add any `SITE_*` / `PUBLISH_*`
   overrides here too. Generate a **service token** for the config (this is the
   `DOPPLER_TOKEN` used by CI — distinct from the HubSpot key).
3. **GitHub** — add the Doppler service token as a repository secret named
   `DOPPLER_TOKEN` (Settings → Secrets and variables → Actions).
4. **GitHub Pages** — Settings → Pages → **Source: GitHub Actions**. The custom
   domain is set via [`CNAME`](CNAME) and preserved on every build.

After that, [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
rebuilds and publishes on every push to `main`, once daily (cron), or on manual
dispatch. Pull requests build for validation but do not deploy.

---

## Troubleshooting

**`403 Forbidden` / `MISSING_SCOPES` — "The scope needed for this API call isn't
available for public use."**

The token in `HUBSPOT_SERVICE_KEY` cannot read the CRM object being requested.
This is a credentials problem, not a code problem — no repo change fixes it.
Check, in order:

1. The token is a **Private App access token** from portal `244055979`, not a
   developer API key and not a token from another portal.
2. The Private App grants `crm.objects.deals.read`. Changing scopes in HubSpot
   **regenerates the token** — copy the new value into Doppler.
3. Doppler's `prd` config holds the updated `HUBSPOT_SERVICE_KEY`, and the
   `DOPPLER_TOKEN` repo secret is a service token scoped to that config.

The build fails loudly and the deploy job is skipped, so the previously
published site stays up untouched while this is being fixed.

**`400 Bad Request` on the search call.** Usually `PUBLISH_REQUIRE_MARKER=true`
while the `publish_to_portal` property does not exist on Deals in HubSpot.
Create the property first, or turn the flag off.

---

## Project layout

```
scripts/
  config.mjs     # all portal/site configuration + env overrides
  hubspot.mjs    # HubSpot fetch (deals + pipeline stages), pipeline guard, mock fallback
  build.mjs      # transform deals -> disputes, render, emit dist/
  render.mjs     # HTML template
  serve.mjs      # local static preview server
src/
  styles.css     # design system (light/dark, responsive)
  app.js         # client-side search + status filtering
mock/
  disputes.sample.json
.github/workflows/deploy.yml
CNAME
```

Build output (`dist/`) is generated by CI and is **not** committed.
