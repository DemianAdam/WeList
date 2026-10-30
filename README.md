# WeList

A Spanish-language DJ request and voting app. Runs immediately with a local demo; includes a separate Convex implementation and Convex Auth.

## Run locally

Requires Node 22+ and a modern browser (Web Locks are used for cross-tab demo writes).

```sh
npm install
npm run dev
```

Open the printed URL. Guests use `/`; the DJ uses `/dj-booth`. **Demo password: `welist-demo`.** No environment variables are required. Demo data persists in localStorage and updates between tabs on the same origin. Different browsers/devices do not share the demo database. Clear the `welist-demo-v2` localStorage key to reset the sample event. Initial votes are explicitly fictional.

## Structure

- `src/features/`: guest and DJ workflows.
- `src/components/`: accessible dialog and reusable song row.
- `src/data/`: adapter contract, browser mock, Convex adapter, React subscription provider.
- `src/domain.ts`: demo catalog and pure voting rules.
- `convex/`: schema, atomic guest operations, authorized administration, internal storage, Node actions, hourly cleanup.
- `convex/auth.ts` and `convex/http.ts`: Convex Auth password provider and routes.
- `tests/`: Convex integration tests and Playwright mobile flows.
- `docs/SETUP.md`: credentials, deployment and production validation.

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

## Product rules

One required Instagram profile visit, plus a second optional profile visit when configured, and explicit confirmation unlock an event. Follows are not verified. Guests spend three votes across three songs for the entire night; a new request spends a vote. Removed songs remain blocked and votes are never refunded. DJs may undo removal for ten seconds. Ending the event closes writes. A new event has new participation and budgets. Search shows matching requests and shared event-cache results first, expands automatically when fewer than five songs match, and offers “Buscar más canciones” for manual expansion. Completed events expire after 30 days.

## Current boundaries

No cloud deployment or live Spotify verification has been performed. Spotify eligibility, brand assets, mobile Instagram app switching, and the 100-client network load exercise require staging configuration. Use mock mode locally or the Convex deployment for the end-to-end flow. See setup documentation for the exact steps.
