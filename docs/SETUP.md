# Cloud setup — WeList

## 1. Create the Convex project

Run `npx convex dev` and create **WeList**. The CLI creates the deployment configuration and `_generated` bindings. The checked-in backend uses schema-derived builders in `convex/lib/server.ts`, so it can be typechecked and unit-tested before this step. Generated bindings can be adopted later without changing the adapter contract.

Use separate development and production deployments. Never commit `.env` files or secrets. `npm run typecheck` checks the backend independently of generated bindings.

## 2. Configure Convex Auth and server secrets

Share the direct URL `https://<your-domain>/dj-booth` with the DJ and ask them to bookmark it. The guest page does not link to the booth; the URL itself is not a security credential.

WeList uses Convex Auth for the single DJ account `admin@welist.local`. Public signup is disabled. Deploy the backend first, configure Convex Auth's `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` for the deployment (see https://labs.convex.dev/auth/setup), and explicitly provision the DJ. An existing account has no DJ rights until this is done.

Obtain a deployment admin key from the Convex dashboard. In a private PowerShell session set `$env:WELIST_CONVEX_URL` to the exact deployment URL and `$env:WELIST_DEPLOY_KEY` to its admin key, then run `npm run admin:setup`. The command generates and displays a new DJ password once; save it in a password manager. It sends the password directly to an internal Convex action using the deployment key. Never commit, share, or expose that key. Clear the environment variables afterward.

For password recovery, rerun the same command against the intended deployment. It resets the password, invalidates existing sessions, and explicitly authorizes the account. During reprovisioning access is revoked until the operation finishes. If interrupted, rerun it. Provision development and production separately. The obsolete `admin:secret` hash and gateway secret are not used.

In the Convex dashboard, set:

| Variable                      | Value                                            |
| ----------------------------- | ------------------------------------------------ |
| `SPOTIFY_CLIENT_ID`           | Spotify developer app client ID                  |
| `SPOTIFY_CLIENT_SECRET`       | Spotify developer app client secret              |
| `SPOTIFY_REQUESTS_PER_MINUTE` | Start at 120; tune to the granted provider quota |
| `GUEST_SESSIONS_PER_MINUTE`   | Optional global ceiling; defaults to 1,000       |

Spotify credentials must **never** have a `VITE_` prefix. They stay in Convex actions. Anonymous guest session tokens are issued by a Convex mutation and only their SHA-256 digests are stored. Convex Auth owns DJ sessions.

## 3. Configure Vercel

Import the repository as **WeList**, framework Vite, build command `npm run build`, output `dist`. Set the following for each deployment environment:

| Variable          | Value                                         |
| ----------------- | --------------------------------------------- |
| `VITE_DATA_MODE`  | `convex`                                      |
| `VITE_CONVEX_URL` | Corresponding Convex `.convex.cloud` URL      |
| `VITE_PUBLIC_URL` | Permanent venue HTTPS origin used in QR codes |

Deploy the backend with `npx convex deploy` for production. Then deploy the frontend. `vercel.json` provides SPA fallback and response security headers.

Guest session creation and admin login go directly to Convex. Guest issuance is rate-limited globally; Convex Auth handles password hashing, sessions, and token refresh for the administrator.

When starting an event, configure one required Instagram profile. A second profile may be left blank; guests must visit every profile that was configured before confirming participation. The profile list is frozen when the event starts.

## 4. Verify Spotify

Create an app in Spotify's developer dashboard. **Before a venue pilot, confirm that the intended use is permitted** by Spotify's [Developer Policy](https://developer.spotify.com/policy), including its restrictions concerning businesses and public playback; development credentials alone do not establish eligibility. Search uses client credentials, never guest Spotify login. The UI uses an adapter boundary so a different catalog provider can be substituted if needed.

In staging, create an event and enter a query. Search automatically checks existing requests and the current event's shared song cache; when fewer than five distinct songs match it also checks Spotify. “Buscar más canciones” expands a search manually. Confirm metadata and artwork return, request a track, and verify another browser sees it. Each cached song expires 24 hours after a provider fetch; closing the event blocks cache use immediately and schedules bounded deletion. Exact-query responses, including empty results, expire after 60 seconds. Search hit/miss/provider-call/failure logs contain no search terms. Tokens are reused until within a minute of expiry. HTTP 429 activates a global provider cooldown using Retry-After. No client-provided titles, artists, or artwork can create a request.

Confirm the proposed 24-hour metadata retention and intended venue use with Spotify before any pilot. The existing event history also retains requested-track metadata for up to 30 days after an event; review that separately under the current provider terms. Emulator tests and these durations do not establish permission.

After updating an existing deployment, older global cache entries are not reused and expire through normal cleanup. Guests with old, unrequested search results should search again to obtain event-scoped trusted metadata. Existing event requests and votes remain intact.

Review current Spotify branding rules before publication, including official logo attribution alongside metadata, artwork treatment and links. The app already includes direct Spotify links and provider artwork; official brand assets are not bundled. Sources: https://developer.spotify.com/documentation/web-api and https://developer.spotify.com/documentation/design

## 5. Pilot validation

- Test with iOS Safari and Android Chrome on actual phones, including Instagram installed/not installed, denied popups, and return navigation. No focus listener grants access.
- Confirm your permanent QR resolves to the public origin, never localhost.
- Test drops in connectivity; observe pending operations, reconnects, expired sessions, and event closure during pending writes. No durable offline replay queue exists.
- Recheck Convex Auth session refresh and guest session rate limits against the deployed deployment.
- Exercise at least 500 actual new guest session issuances in one minute, including a burst of concurrent requests, and monitor failures, write contention, latency and Convex usage. The configured ceiling alone does not guarantee throughput.
- Verify simultaneous last-vote attempts, duplicate requests, removal and Undo using two real guest browsers.
- Run a 100-client WebSocket load exercise in staging with 20 attempted votes/second. Measure server-confirmed mutation latency and subscription arrival latency separately. Emulator concurrency tests do not validate this throughput.
- Collect DJ feedback manually. Profile clicks are not follows, removed songs are not necessarily played, and browser sessions are not people.

## Retention and limits

An hourly cron removes ended-event data older than 30 days in bounded batches and cleans expired sessions, cached metadata and rate-limit windows. Large datasets may take several cron runs to drain. Active events are not automatically ended. The pilot leaderboard has a 1,000-row safety bound; revisit pagination before events with larger request volumes. Search matches use case-insensitive substrings; recording-level deduplication is not implemented.

This pilot has no payments, playback integration, user accounts, verified follow checks, or multi-venue tenancy.
