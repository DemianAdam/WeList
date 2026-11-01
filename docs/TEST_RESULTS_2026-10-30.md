# WeList test results — 30 October 2026

## Environment and scope

Tested on Windows with Node v24.14.0, starting from Git revision `23151929a3c9aa6d2b21de70531aa69b5008c45a` plus the uncommitted test/tooling/documentation changes in this work. Application source was not changed. Local browser tests use the mock adapter; staging browser tests use a local Vite frontend connected to the disposable Convex development deployment `intent-hedgehog-273`. No hosted production frontend or personal development deployment was load-tested.

## Functional checks

| Check                                              | Result                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Typechecking                                       | Passed                                                                                 |
| Lint                                               | Passed with five existing application warnings; no test/tooling warnings               |
| Production build                                   | Passed                                                                                 |
| Unit/backend/runner tests                          | 43 passed                                                                              |
| Local browsers including the new defect regression | 54 passed; 3 failed (one search-count defect reproduced in all three browser projects) |
| Real staging browsers                              | 6 passed, none skipped, across the same browser families                               |
| Live Spotify smoke                                 | Blocked: backend returned `SEARCH_NOT_CONFIGURED`; staging has no Spotify credentials  |

Staging browser checks verified independent guest tokens, shared vote counts, offline/reconnect updates, persisted vote budgets, real password login, DJ session restoration after reload, removal/undo, ending/starting events and logout. Emulator tests additionally verify concurrent last-vote attempts, simultaneous same-guest duplicates, expired sessions, unauthorized DJ writes, undo expiry, provider failures/timeouts and staging fixture guards.

The load-runner tests verify refusal of disabled staging/non-synthetic events, operation timeouts, rejected mutation responses, failure retention after a successful retry, incorrect totals, missing/coalesced subscriptions, latency failures, fixed-rate scheduling independent of slow responses, and a nonzero CLI exit with a saved blocked report when staging credentials are absent.

## Reported application defects

**Search result count shows the event's ranked-song total rather than the displayed matches.**

1. Open the fresh local demo at `/`.
2. Search for `Blinding Lights`.
3. One song card is displayed, while the Results header says `4 CANCIONES`.

The same inconsistency appeared in staging: ten synthetic search results alongside `0 CANCIONES` when the leaderboard was empty. The header in `src/features/Guest.tsx` uses the active leaderboard length during search. The new ordinary regression test in `tests/browser/search-count.spec.ts` asserts the visible search count and is intentionally left failing until the application defect is fixed. No application repair or expected-failure annotation was applied.

Two harness issues were corrected during validation: an existing test navigated away before asynchronous event creation completed, and the initial staging link locator omitted the decorative arrow from its exact accessible name. Corrected workflow suites passed. Initial interrupted/failing harness runs are not capacity evidence.

**Simultaneous session arrivals can fail with a backend write conflict.** The first 500-at-once run issued 499 sessions and failed one operation. A read-only staging log inspection found a matching `guest:issueSession` backend write-conflict error. The runner correctly marked this scenario unsuccessful. Reproduce with the isolated staging fixture and `npm run test:staging -- --i-understand-staging --scenario burst --repeats 3`; the occurrence rate depends on contention. No application fix was made.

## Traffic results

Nine complete scenarios were measured: three paced arrivals, three simultaneous bursts and three five-minute connected-client runs. The arrival results and connected results are in separate raw files because the initial connected attempt was discarded when the harness was corrected to schedule writes independently of completion. All connected results below use the corrected fixed-rate scheduler. Session counts are client-confirmed responses; failed transport requests can have uncertain server outcomes.

| Run         | Sessions issued | Unexpected failures | Final votes | Session p95 ms | Vote p95 ms | Subscription p95 ms | Result |
| ----------- | --------------: | ------------------: | ----------: | -------------: | ----------: | ------------------: | ------ |
| paced 1     |             500 |                   0 |           — |            260 |           — |                   — | PASS   |
| paced 2     |             500 |                   0 |           — |            231 |           — |                   — | PASS   |
| paced 3     |             500 |                   0 |           — |            425 |           — |                   — | PASS   |
| burst 1     |             499 |                   1 |           — |           1810 |           — |                   — | FAIL   |
| burst 2     |             492 |                   8 |           — |           1843 |           — |                   — | FAIL   |
| burst 3     |             500 |                   0 |           — |           1764 |           — |                   — | PASS   |
| connected 1 |             100 |                   0 |         300 |            612 |         744 |                 795 | PASS   |
| connected 2 |             100 |                   0 |         300 |            618 |         724 |                 785 | PASS   |
| connected 3 |             100 |                   0 |         300 |            557 |         539 |                 592 | PASS   |

All paced runs passed. Two of three bursts failed, issuing 499 and 492 sessions; the third issued all 500. Therefore the instantaneous 500-arrival target is **not validated**. A redacted function-log summary confirms a backend write conflict for one failed issuance; the saved client reports classify other failed operations generically and do not establish their individual causes.

Each connected run held 100 clients for at least five minutes, recorded exactly 300 votes, verified three distinct votes per guest, received all 1,500 expected subscription observations and completed cached-search checks without unexpected failures. Their p95 mutation and submission-to-subscription latency stayed below 2,000 ms. Batch submission offsets are retained in the raw JSON so the one-second scheduling can be audited.

These measurements support the tested paced-arrival and 100-connected-client workloads in this staging environment. They do not establish production capacity or reliability for an instantaneous 500-person arrival. The overall load assessment fails because burst failures remain.

The runner closed its WebSocket clients and disabled the staging load flag; the flag was verified false again by the execution wrapper and an independent CLI query. Temporary staging DJ authorization was revoked after testing. The disposable deployment and synthetic records are retained for inspection; delete the named deployment through the Convex dashboard when no longer needed. No deployment key was saved to tracked files.

Raw load files: `test-results/load/2026-10-30T20-51-40-956Z.json`, `test-results/load/2026-10-30T21-04-09-230Z.json`. Consolidated results: `test-results/load-summary.json`.

## Artifacts and limits

- Unit results: `test-results/unit.json`; check logs: `test-results/typecheck.log`, `test-results/lint.log`, `test-results/build.log`.
- Local browser JSON: `test-results/local-browser.json`; screenshots/traces: `test-results/local-browser/`; HTML: `playwright-report/local/`.
- Cloud browser JSON: `test-results/staging-browser.json`; HTML: `playwright-report/staging/`.
- Spotify outcome: `test-results/spotify-smoke.json`; load JSON: `test-results/load/`; execution/cleanup: `test-results/staging-execution.json`.

Generated artifacts are ignored by Git and remain in this workspace. See [TESTING.md](TESTING.md) for rerun commands and interpretation. Real Spotify search/metadata, physical-phone Instagram switching, a publicly hosted QR, CDN response headers and production capacity remain unverified. Automated WebKit is not a physical iPhone test.
