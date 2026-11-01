# Reliable guest sessions — 1 November 2026

## Change and environment

Implemented idempotent registration, shared token-bucket admission, bounded browser recovery and private diagnostics. Removed the aggregate song count while retaining song votes and remaining budgets. Tested on Windows with Node v24.14.0, using the disposable Convex deployment `intent-hedgehog-273`. Backend support and the `@convex-dev/rate-limiter` 0.4.3 component were deployed to staging before testing the cloud frontend. Production and the personal development backend were not deployed.

The bucket used the planned defaults: refill 1,000/minute, capacity 1,000 and 64 shards, synchronous consumption. The first raw burst ran before guest browser activity against the newly installed component; subsequent bursts exercised existing state. Existing sessions remained valid, and legacy issuance shares the new bucket. Session counts are confirmed client responses, not people.

The change is tested as a working tree on top of the repository revision recorded in the raw load files. [October 30 results](TEST_RESULTS_2026-10-30.md) are preserved as historical evidence.

## Functional verification

| Check                          | Result                                         |
| ------------------------------ | ---------------------------------------------- |
| Unit/backend/diagnostics tests | 62 passed                                      |
| Typecheck                      | Passed                                         |
| Build                          | Passed                                         |
| Lint                           | Passed, five existing application warnings     |
| Local browser projects         | 57 passed on the full rerun                    |
| Real staging browser projects  | 12 passed, 0 failed, 0 skipped                 |
| Recovery exercise              | 20/20 recovered; exactly 20 distinct sessions  |
| Legacy compatibility           | 5/5 issued and reused through the new endpoint |

Tests cover same-credential concurrency, one session/one capacity charge, recovery after a committed-but-lost response, successful reuse while capacity is exhausted, expiry without renewal, role/input/configuration validation, bucket refill, preserved legacy sessions, cross-tab serialization, reload recovery, storage errors, timeouts, jitter, retry-after, terminal errors, disposal and diagnostic redaction. Subscription/network errors preserve identity and votes; only verified expiry clears identity and cancels the pending action.

The final twelve-case cloud browser suite also delayed a successful registration response by four seconds. Chromium, WebKit and desktop Chromium each retried with the same credential and preserved one vote and its remaining budget after reload. Credential equality was checked in memory through a boolean assertion. Real staging transport/action traces were disabled to prevent credential capture; failure screenshots and safe diagnostics remain available.

The recovery exercise deliberately injected ten lost responses after server commit and ten transport failures before request submission. All twenty first-attempt failures remain visible in JSON and are marked as deliberate injections only in this scenario. A privileged staging audit found twenty distinct session records. Controlled component tests independently verified that recovery consumes no extra admission credit. Raw burst tests have no application retries and cannot exempt injected failures.

One initial local WebKit event-transition case timed out; its isolated repeat and the complete 57-case rerun passed. A sandbox temporary-file import error also required rerunning component tests outside the sandbox. Neither event was hidden with an expected-failure annotation or an automatic retry setting.

## Traffic acceptance

The completed burst runs confirmed 500/500 registrations each with zero unexpected request failures. They still **fail** the unchanged 2,000 ms p95 threshold: 3,122 ms, 2,858 ms and 3,408 ms respectively. Recovery success is separate evidence and does not turn these raw burst results into passes.

All eleven scenarios completed.

| Run         | Sessions confirmed | Unexpected failures | Registration p95 ms | Final votes | Subscription observations | Vote p95 ms | Subscription p95 ms | Result |
| ----------- | -----------------: | ------------------: | ------------------: | ----------: | ------------------------: | ----------: | ------------------: | ------ |
| burst 1     |            500/500 |                   0 |                3122 |           — |                         — |           — |                   — | FAIL   |
| burst 2     |            500/500 |                   0 |                2858 |           — |                         — |           — |                   — | FAIL   |
| burst 3     |            500/500 |                   0 |                3408 |           — |                         — |           — |                   — | FAIL   |
| recovery 1  |              20/20 |                   0 |                 328 |           — |                         — |           — |                   — | PASS   |
| legacy 1    |                5/5 |                   0 |                 317 |           — |                         — |           — |                   — | PASS   |
| paced 1     |            500/500 |                   0 |                 428 |           — |                         — |           — |                   — | PASS   |
| paced 2     |            500/500 |                   0 |                 344 |           — |                         — |           — |                   — | PASS   |
| paced 3     |            500/500 |                   0 |                 290 |           — |                         — |           — |                   — | PASS   |
| connected 1 |            100/100 |                   0 |                1058 |         300 |                      1500 |         568 |                 622 | PASS   |
| connected 2 |            100/100 |                   0 |                 856 |         300 |                      1500 |         620 |                 643 | PASS   |
| connected 3 |            100/100 |                   0 |                 870 |         300 |                      1500 |         594 |                 695 | PASS   |

All three five-minute connected-client runs passed. Each held 100 clients, recorded 300 votes, verified three distinct votes per guest, received all 1,500 expected subscription observations, and completed cached-search checks without unexpected failures.

The raw burst tests confirmed all 1,500 registrations with no unexpected request failures, compared with nine failed requests in the October 30 sample. This is measured improvement in confirmed request success, not a guarantee that internal conflicts never occur. All three burst runs still fail the unchanged 2,000 ms p95 threshold, so overall load acceptance remains **FAILED**. No retry-assisted result or threshold change was used to turn a burst into a pass.

Burst latency includes transport, scheduling and execution. A retrospective log query did not return matching earlier burst operation IDs, so no timing attribution between those layers was established. The latency gap remains unresolved.

The runner closed its clients and verified that the staging load flag was disabled. The browser verification wrapper independently disabled the flag and revoked temporary DJ authorization. The disposable deployment and synthetic records remain available for inspection; delete the named deployment through the Convex dashboard when no longer needed. No production deployment occurred.

Raw sources: `test-results/session-load/2026-11-01T21-45-55-785Z.json`, `test-results/session-load/2026-11-01T21-49-15-353Z.json`, `test-results/session-load/2026-11-01T21-53-00-294Z.json`. Consolidated result: `test-results/registration-summary.json`.

## Artifacts and remaining limits

Raw load results are in `test-results/session-load/`; the execution ledger is `test-results/registration-execution.json`. Unit results are `test-results/registration-unit.json`; local and cloud browser results are `test-results/local-browser.json` and `test-results/staging-browser.json`. Typecheck, build and lint logs have the `test-results/registration-` prefix. Generated artifacts are ignored by Git and remain in the workspace.

Diagnostics retain correlation IDs, application-attempt numbers, safe categories, timings and reliably available platform request IDs. No tokens, hashes, credentials, raw arguments or unrestricted exception messages are recorded by the diagnostic utilities. Browser logs remain local; no external monitoring service was added.

An npm dependency audit reports one critical advisory against the existing direct `@auth/core` dependency. Its locked version was not changed by the limiter installation. No unrelated authentication dependency upgrade was applied.

Spotify configuration, physical-phone Instagram switching, hosted QR/CDN verification and production release are outside this change. Burst latency remains an explicit acceptance gap; no threshold was relaxed.
