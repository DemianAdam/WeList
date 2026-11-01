# Backend architecture

WeList keeps Convex as the database, transaction boundary, and realtime API. Features own their endpoints and business operations. The React UI continues to communicate through `src/data/types.ts`; `src/data/convex.ts` translates the backend contracts into that interface.

## Finding the code

| Feature          | Owns                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `sessions/`      | Guest registration, legacy issuance, session checks, admission bucket, session table        |
| `events/`        | Current event, DJ dashboard, start/end lifecycle, live-event checks, venue and event tables |
| `participation/` | Profile gate and the guest's participation state                                            |
| `requests/`      | Leaderboard, requests, votes, moderation, request and vote tables                           |
| `music/search/`  | Search orchestration, local lookup, caches, lease coordination, track caches                |
| `music/spotify/` | Validated HTTP client, provider credentials, cooldown and quota state                       |
| `maintenance/`   | Hourly retention and end-of-event cache cleanup                                             |
| `operations/`    | Internal DJ provisioning and guarded staging fixtures                                       |
| `platform/`      | Admin authorization, hashing, rate-limit primitives and their table                         |
| `contracts/`     | Public command results, search results, operation-specific error unions                     |

`schema.ts` composes feature `tables.ts` exports with Convex Auth tables. Existing table names, fields, indexes, documents, and retention windows are unchanged. Shared track metadata and its validator belong to `music/validators.ts`.

## File roles and dependency direction

- `queries.ts`, `mutations.ts`, and `actions.ts` register Convex endpoints with explicit public/internal visibility and argument validators. `validators.ts` holds their argument definitions.
- `model.ts` and focused helpers contain ordinary typed functions, not registered endpoints. Access checks execute at the start of protected business operations, before data access or writes, and use the caller's Convex context.
- The direction is endpoint → feature operation → feature helpers/platform. Frontend code imports generated references and contract types, never business implementations at runtime.
- Share live-event checks from `events/access.ts`, guest-session checks from `sessions/access.ts`, and admin authorization from `platform/authorization.ts`. Do not add generic service registries or repository wrappers.
- `orchestrator.node.ts` and `client.node.ts` run only behind the Node action entrypoint. Query/mutation modules must not import these Node files.
- Use `api` for public calls and `internal` for server-only operations, both from `_generated/api`. Use contexts/builders/IDs from `_generated`; regenerate them with the Convex CLI rather than editing them.

## Transactions and external work

Registration checks an existing hashed credential before consuming admission capacity and inserting a session, all in one mutation. Request/vote validates session, current event, gate, duplicate, archive state, and budget before writing request/vote/budget changes in a single mutation.

Search actions perform external work between transactional calls. Acquiring a search lease also checks cache, global limits, cooldown, and exclusive quota-probe state in one mutation. Cache publication checks lease owner and expiration atomically; stale owners cannot publish. Quota transitions check probe ownership. Keep these operations together when extending the feature.

Preserved search behavior: normalized terms, requested songs before event-cache songs, provider expansion below five matches or when forced, archived-track filtering, shared in-flight requests, empty-response caching, 25-second leases/probes, 28-second wait budget, 250 ms polling, and 10-second HTTP timeouts. Query-result cache expires after one minute; event songs after one day; the legacy global track cache after one hour.

## Public contracts and endpoint migration

Commands return `{ ok: true, data }` or `{ ok: false, error: { code, retryAfterMs? } }`; commands with no payload use `data: null`. Each command has a specific error-code union. Validation/access failures throw `ConvexError({ code })`. Queries return typed data or `null` without a wrapper.

Search success includes `{ tracks, source, warning? }`. A provider failure preserves local tracks with a warning, including when the local list is empty. Session/event access failures throw; guest search admission failures return a failed result. The adapter retains the current Spanish UI messages and preserves guest identity on network/unknown failures.

| Previous endpoint                             | Current endpoint                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `guest:registerSession`, `guest:issueSession` | `sessions/mutations:registerSession`, `sessions/mutations:issueSession`         |
| `guest:current`, `admin:dashboard`            | `events/queries:currentEvent`, `events/queries:dashboard`                       |
| `admin:start`, `admin:end`                    | `events/mutations:startEvent`, `events/mutations:endEvent`                      |
| `guest:participation`, `guest:gate`           | `participation/queries:participation`, `participation/mutations:updateGate`     |
| `guest:leaderboard`, `guest:requestOrVote`    | `requests/queries:leaderboard`, `requests/mutations:requestOrVote`              |
| `admin:archive`                               | `requests/mutations:setArchived`                                                |
| `services:localSearch`, `services:search`     | `music/search/actions:localSearch`, `music/search/actions:search`               |
| `admin:providerStatus`, `admin:retryProvider` | `music/spotify/queries:providerStatus`, `music/spotify/mutations:retryProvider` |
| `cleanup:*`                                   | `maintenance/mutations:*` (internal)                                            |
| `provision:*`, `staging:*`                    | `operations/provision:*`, `operations/staging:*` (existing visibility retained) |

Root `auth.ts`, `http.ts`, schema/configuration files, and cron registration remain framework entrypoints. Obsolete root API paths have no compatibility wrappers. The legacy issuance capability remains at its new endpoint and uses the new result contract.

## Adding an operation and releasing changes

1. Put the operation in its owning feature and define arguments in that feature's validators.
2. Implement transaction-local rules as ordinary functions. Reuse access helpers before reading protected data or writing.
3. Register a public endpoint only if clients need it; otherwise use internal visibility. Define its result type and expected error union in contracts.
4. Add behavior/concurrency tests using `tests/support/backend.ts`; test response translation in `tests/adapters/` when the UI boundary changes.
5. Regenerate Convex bindings, update callers, and run typecheck, lint, tests, build, and local browser flows.

Release the renamed API and updated frontend in a coordinated maintenance window. Stop new traffic and drain existing scheduled jobs, deploy backend and frontend, require clients to reload, and verify new endpoints on an isolated staging deployment before resuming traffic. Roll back backend/frontend together if needed; stored data requires no migration. Preserve historical test reports, whose endpoint names describe the code tested at that time.
