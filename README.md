# WeList

A Spanish-language request and voting app for private gatherings of friends. Runs immediately with a local demo; includes a separate Convex implementation and Convex Auth.

## Run locally

Requires Node 22+ and a modern browser (Web Locks are used for cross-tab demo writes).

```sh
npm install
npm run dev
```

Open the printed URL. Guests use `/`; the DJ uses `/dj-booth`. **Demo password: `welist-demo`.** No environment variables are required. Demo data persists in localStorage and updates between tabs on the same origin. Different browsers/devices do not share the demo database. Clear the `welist-demo-v2` localStorage key to reset the sample event. Initial votes are explicitly fictional.

## Structure

- `convex/`: feature modules for sessions, events, participation, requests, music search, and Spotify; `schema.ts` composes their unchanged table definitions.
- `convex/platform/`: shared authorization, hashing, and rate-limit helpers.
- `convex/contracts/`: typed command results, search results, and business error codes.
- `convex/operations/` and `convex/maintenance/`: provisioning, guarded staging fixtures, and cleanup.
- `src/features/`: guest and DJ workflows; `src/data/` translates backend responses through the existing UI adapter contract.
- `tests/backend/`, `tests/adapters/`, and `tests/support/`: feature integration tests, adapter tests, and reusable fixtures. Browser suites live in `tests/browser/` and `tests/staging/`.
- `shared/`: browser/Node session diagnostics; `scripts/`: operational tools and the local test launcher.

Read [the architecture guide](docs/ARCHITECTURE.md) for feature ownership, endpoint names, dependency rules, and transaction boundaries. See [setup](docs/SETUP.md) for credentials and deployment.

The UI never directly changes Convex documents. Commands cross the adapter boundary; the backend validates sessions, event state, gate completion, and vote budgets. Mock authentication is deliberately not secure and is never used in Convex mode.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Backend tests use `convex-test`, without cloud credentials. This verifies transactional rules in an emulator, not cloud load or real network latency. Browser screenshots are written to `test-results/`.

See [the testing guide](docs/TESTING.md) for real staging browser tests, the Spotify smoke check, repeatable traffic scenarios, acceptance thresholds and saved reports.

Latest validation: [1 November 2026 session results](docs/TEST_RESULTS_2026-11-01.md). [October 30 results](docs/TEST_RESULTS_2026-10-30.md) remain available as historical evidence.

## Product rules

One required Instagram profile visit, plus a second optional profile visit when configured, and explicit confirmation unlock an event. Follows are not verified. Guests spend three votes across three songs for the entire night; a new request spends a vote. Removed songs remain blocked and votes are never refunded. DJs may undo removal for ten seconds. Ending the event closes writes. A new event has new participation and budgets. Search shows matching requests and shared event-cache results first, expands automatically when fewer than five songs match, and offers “Buscar más canciones” for manual expansion. Completed events expire after 30 days.

## Current boundaries

Production behavior and live Spotify access are not established by local tests. Spotify eligibility, branding, a public QR, and mobile Instagram app switching still require validation. A synthetic cloud load exercise is recorded in `docs/STAGING_RESULTS.md`. Use mock mode locally or a configured Convex deployment for the end-to-end flow. See setup documentation for the exact steps.
