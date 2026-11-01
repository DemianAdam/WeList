# Testing WeList

Tests report application defects; they do not automatically repair application code.

See [the 1 November 2026 session results](TEST_RESULTS_2026-11-01.md) for the latest measurements. [The October 30 report](TEST_RESULTS_2026-10-30.md) remains historical evidence.

## Local checks

Requires Node 22+ and installed dependencies. Install Playwright browsers once:

```sh
npx playwright install chromium webkit
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The browser suite starts its own mock-mode Vite server on port 5180 and runs mobile Chromium, mobile WebKit and desktop Chromium. Keep that port free. It never reuses another server. No retries hide failures. JSON results are in `test-results/local-browser.json`; failure screenshots and traces are under `test-results/local-browser/`. Open the HTML report with `npx playwright show-report playwright-report/local`.

Backend tests run in the Convex emulator, including concurrent budget/duplicate writes, authorization, session expiry, cache behavior and simulated Spotify quota, failure and timeout responses. These establish functional rules, not cloud capacity.

## Isolated staging setup

Use a disposable deployment containing the current backend. Do not use production or the personal development deployment. Obtain its deployment key through the Convex dashboard or CLI login. Do not commit keys or put them in `VITE_` variables.

Set these environment variables in the testing shell; tooling deliberately does not read `.env.local` as a fallback:

| Variable                     | Purpose                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| `WELIST_STAGING_URL`         | Exact disposable `.convex.cloud` HTTPS origin                       |
| `WELIST_STAGING_DEPLOY_KEY`  | Administrator key for that deployment only; used to reseed fixtures |
| `WELIST_STAGING_ACK`         | `true`, required for staging browsers and Spotify smoke             |
| `WELIST_STAGING_DJ_PASSWORD` | Password for the provisioned DJ on that isolated deployment         |

Deploy to the explicitly selected staging environment. Configure Convex Auth, provision its DJ account, set `WELIST_STAGING_LOAD_TEST=true` on staging, and invoke the internal `staging:seed` function with administrator credentials. The fixture refuses to replace a non-synthetic event. Never enable this flag on other deployments. Set staging Spotify client credentials on the backend if the live provider smoke is required; the synthetic load does not need them.

Run sequentially against the same staging deployment:

```sh
npm run test:e2e:staging
npm run test:spotify
npm run test:staging -- --i-understand-staging
```

The staging browser suite uses a separate cloud-mode frontend on port 5181. It reseeds before each test, uses independent guest browser contexts, and covers live sharing/reconnect and real DJ login, reload, moderation and event lifecycle. Missing staging access fails the preflight. A missing DJ password explicitly skips that test and must be reported as blocked, never as complete validation. Browser output is separate from local results in `test-results/staging/`, `test-results/staging-browser.json` and `playwright-report/staging/`.

Staging also verifies same-browser cross-tab budgets and recovery after a successful registration response is delayed beyond the browser attempt timeout. The response-loss test compares credentials only in memory and asserts a boolean, so assertion failures cannot print a credential. Real staging transport/action traces are disabled to avoid recording credentials; retain failure screenshots and safe structured diagnostic events instead. Local mock traces remain enabled.

The Spotify smoke makes at most two provider search attempts, checks metadata/artwork, requests tracks and verifies that a second guest can find the requested metadata without another provider call. Its result is `test-results/spotify-smoke.json`. `SEARCH_NOT_CONFIGURED` means live integration remains blocked.

## Traffic scenarios and acceptance

Defaults run all three scenarios three times, reseeding a fresh synthetic event before each run and waiting 61 seconds between runs so issuance limits reset:

| Scenario    | Workload                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paced`     | 500 distinct idempotent registrations launched at 120 ms intervals over approximately one minute                                                                                                                                            |
| `burst`     | 500 distinct registrations submitted simultaneously with HTTP client queuing disabled and no application retries                                                                                                                            |
| `connected` | 100 WebSocket clients, each subscribing to event, leaderboard and participation; three distinct votes each, in waves of 20 votes per second, followed by cached searches every 15 seconds per guest during a five-minute connected interval |

Each connected run expects 300 total votes, three distinct votes per guest and 1,500 client/checkpoint leaderboard observations (15 checkpoints × 100 clients). Coalesced updates may satisfy multiple checkpoints. Delivery latency starts when each 20-vote wave is submitted; it includes mutation processing and is not commit-to-delivery latency.

Acceptance requires zero unexpected operation failures, all issued sessions, exact vote totals/budgets, all expected observations within 30 seconds, and p95 session/gate/vote and subscription latency no greater than 2,000 ms. Operation timeouts are 30 seconds. There are no runner retries; failures remain failures. SDK-internal retries are not individually observable. A timeout is an uncertain server outcome, not proof a write was canceled; final-state checks detect discrepancies.

The runner writes a dated JSON file under `test-results/session-load/`, prints per-scenario pass/fail and exits nonzero on any failed criterion or cleanup failure. Reports contain operation timing/error categories, diagnostic operation IDs, application attempt numbers, throughput, percentile summaries, final totals, environment URL, settings and Git revision. They exclude credentials and hashes. The revision identifies HEAD; uncommitted changes must be described in the accompanying report. Raw `burst` runs execute first by default, before `paced` and `connected`.

Additional scenarios are `recovery` (20 guest identities: 10 lost responses after commit, 10 injected pre-request transport failures) and `legacy` (five old-endpoint issuances, each reused through the new endpoint). Only recovery's deliberately injected failures are exempted from its own acceptance check; their first-attempt failures remain in the JSON. The audit verifies the number of distinct sessions. Controlled component tests independently verify one capacity charge per identity. Raw scenarios can never exempt a failure as an injected recovery event. Comma-separated scenario lists are supported, for example `--scenario recovery,legacy --repeats 1`.

For a cold burst, deploy the component to a fresh isolated deployment and run `burst` before other guest activity. Subsequent runs exercise existing limiter state. Retain the 61-second cooldowns so the bucket can refill; reseeding an event does not reset admission state.

Session successes count confirmed responses, not a database census of all issued sessions. Failed transport requests can have uncertain server outcomes. Latency summaries cover successful operations; failures and their durations remain in the raw records and always fail the acceptance check.

For focused diagnostics:

Re-enable the staging flag and seed the synthetic fixture before each new invocation; the preceding load run disables the flag.

```sh
npm run test:staging -- --i-understand-staging --scenario burst --repeats 1
npm run test:staging -- --i-understand-staging --scenario recovery,legacy --repeats 1
npm run test:staging -- --i-understand-staging --scenario connected --repeats 1 --hold-seconds 60 --latency-ms 2000 --delivery-ms 2000 --output test-results/diagnostic-load
```

Short diagnostic holds do not establish the default five-minute capacity target. The full default run takes roughly half an hour; do not run browser/smoke suites or another load runner concurrently against its event.

The runner disables and verifies the staging flag on completion, failure after verified preflight, and handled interruption. Always verify cleanup if the process is forcibly killed. If a browser or Spotify-only run ends before the load runner starts, manually disable the flag in a `finally` step. Dispose of the temporary deployment through the Convex dashboard (or retain only until its configured expiry); disabling the flag does not delete synthetic records or revoke a deployment key. Clear the shell's staging credentials afterward.

## Remaining manual checks

Check physical iOS/Android Instagram switching, denied popups, return navigation and the hosted public QR on real devices. Local Vite testing does not validate CDN response headers or a publicly hosted frontend. Staging results describe the measured network/environment, not a production capacity guarantee.
