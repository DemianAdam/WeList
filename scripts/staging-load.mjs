import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  assertStaging,
  bounded,
  evaluate,
  measure,
  observeCheckpoints,
  paceBatches,
  requireOk,
  sleep,
  summarize,
} from "./load-core.mjs";

const { values } = parseArgs({
  options: {
    "i-understand-staging": { type: "boolean" },
    scenario: { type: "string", default: "all" },
    repeats: { type: "string", default: "3" },
    "hold-seconds": { type: "string", default: "300" },
    "latency-ms": { type: "string", default: "2000" },
    "delivery-ms": { type: "string", default: "2000" },
    output: { type: "string", default: "test-results/session-load" },
  },
});
const url = process.env.WELIST_STAGING_URL;
const key = process.env.WELIST_STAGING_DEPLOY_KEY;
const numeric = (name) => {
  const n = Number(values[name]);
  if (!Number.isSafeInteger(n) || n <= 0) throw Error(`Invalid --${name}`);
  return n;
};
const repeats = numeric("repeats"),
  holdMs = numeric("hold-seconds") * 1000;
const thresholds = {
  latencyMs: numeric("latency-ms"),
  deliveryMs: numeric("delivery-ms"),
};
const scenarios =
  values.scenario === "all"
    ? ["burst", "paced", "connected"]
    : values.scenario.split(",");
if (
  scenarios.some(
    (s) => !["paced", "burst", "connected", "recovery", "legacy"].includes(s),
  )
)
  throw Error("Unknown scenario");
const ref = (name) => makeFunctionReference(name);
let revision = "unknown";
try {
  revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {
  /* report unknown */
}
const report = {
  startedAt: new Date().toISOString(),
  revision,
  url: url ?? null,
  thresholds,
  settings: { repeats, holdMs, scenarios },
  runs: [],
  cleanup: "not attempted",
};
await mkdir(values.output, { recursive: true });
const reportPath = `${values.output}/${report.startedAt.replaceAll(/[:.]/g, "-")}.json`;
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2));
let http,
  admin,
  verified = false;
const query = (name, args = {}) => bounded(() => http.query(ref(name), args));
const activeClients = new Set();

async function run(scenario, repeat) {
  const result = {
    scenario,
    repeat,
    records: [],
    sessionSuccesses: 0,
    expectedSessions:
      scenario === "connected"
        ? 100
        : scenario === "recovery"
          ? 20
          : scenario === "legacy"
            ? 5
            : 500,
    arrivals: [],
  };
  report.runs.push(result);
  const started = performance.now(),
    tokens = [],
    clients = [],
    unsubscribes = [];
  const checkpointDeliveries = [];
  try {
    assertStaging(await query("staging:enabled"), await query("guest:current"));
    const seeded = await bounded(() => admin.mutation(ref("staging:seed"), {}));
    const event = await query("guest:current");
    assertStaging(await query("staging:enabled"), event);
    if (event._id !== seeded.eventId) throw Error("Event changed during setup");
    result.eventId = event._id;
    const issue = async (ordinal) => {
      const args = {
        bootstrapToken: randomBytes(32).toString("hex"),
        operationId: randomUUID(),
      };
      let token;
      if (scenario === "legacy") {
        token = await measure(
          result.records,
          "session",
          async () => {
            const value = await http.mutation(
              ref("guest:issueSession"),
              {},
              { skipQueue: true },
            );
            if (typeof value !== "string" || value === "RATE_LIMITED")
              throw Object.assign(Error("Session rejected"), { data: value });
            return value;
          },
          30000,
          { operationId: args.operationId, attempt: 1 },
        );
        const reused = await http.mutation(
          ref("guest:registerSession"),
          { ...args, bootstrapToken: token },
          { skipQueue: true },
        );
        if (reused.status !== "OK" || !reused.reused)
          throw Error("Legacy identity incompatible");
      } else {
        const attempts = scenario === "recovery" ? 2 : 1;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            await measure(
              result.records,
              "session",
              async () => {
                if (scenario === "recovery" && attempt === 1 && ordinal >= 10)
                  throw Object.assign(new TypeError("fetch failed"), {
                    expectedInjection: true,
                  });
                const value = await http.mutation(
                  ref("guest:registerSession"),
                  args,
                  { skipQueue: true },
                );
                if (value.status !== "OK")
                  throw Object.assign(Error("Registration rejected"), {
                    data: value.status,
                  });
                if (scenario === "recovery" && attempt === 1)
                  throw Object.assign(new TypeError("fetch failed"), {
                    expectedInjection: true,
                  });
                if (scenario === "recovery" && value.reused !== ordinal < 10)
                  throw Error("Unexpected recovery identity");
                return value;
              },
              30000,
              { operationId: args.operationId, attempt },
            );
            token = args.bootstrapToken;
            break;
          } catch (error) {
            if (
              scenario !== "recovery" ||
              error.expectedInjection !== true ||
              attempt !== 1
            )
              throw error;
          }
        }
        if (!token) throw Error("Registration missing");
      }
      tokens.push(token);
      result.sessionSuccesses++;
    };
    const issuanceStart = performance.now(),
      issuance = [];
    for (let i = 0; i < result.expectedSessions; i++) {
      if (scenario === "paced")
        await sleep(Math.max(0, issuanceStart + i * 120 - performance.now()));
      issuance.push(issue(i).catch(() => {}));
    }
    await Promise.all(issuance);
    result.uniqueSessions = new Set(tokens).size;
    result.issuanceElapsedMs = performance.now() - issuanceStart;
    if (result.uniqueSessions !== result.sessionSuccesses)
      throw Error("Duplicate session tokens");
    if (scenario === "recovery") {
      result.initialInjectedFailures = result.records.filter(
        (r) => r.expectedInjection,
      ).length;
      const audit = await bounded(() =>
        admin.query(ref("staging:auditSessions"), {
          hashes: tokens.map((t) =>
            createHash("sha256").update(t).digest("hex"),
          ),
        }),
      );
      result.recoveryAudit = audit;
      if (
        result.initialInjectedFailures !== 20 ||
        audit.sessions !== 20 ||
        audit.distinctSessions !== 20
      )
        throw Error("Recovery audit failed");
    }
    if (scenario !== "connected") return;
    if (tokens.length !== 100)
      throw Error("Connected scenario requires 100 sessions");
    result.expectedVotes = 300;
    result.expectedObservations = 1500;
    const checkpoints = [],
      observed = Array.from({ length: 100 }, () => new Set()),
      ready = [];
    for (let i = 0; i < 100; i++) {
      const client = new ConvexClient(url, {
        unsavedChangesWarning: false,
        logger: false,
      });
      clients.push(client);
      activeClients.add(client);
      for (const [name, args, update] of [
        [
          "guest:current",
          {},
          (e) => {
            if (e?._id !== event._id || e.status !== "live")
              result.subscriptionErrors = (result.subscriptionErrors ?? 0) + 1;
          },
        ],
        [
          "guest:participation",
          { token: tokens[i], eventId: event._id },
          () => {},
        ],
        [
          "guest:leaderboard",
          { eventId: event._id, limit: 50 },
          (rows) =>
            observeCheckpoints(
              checkpoints,
              observed[i],
              rows.reduce((sum, r) => sum + r.votes, 0),
              performance.now(),
              checkpointDeliveries,
            ),
        ],
      ]) {
        ready.push(
          measure(
            result.records,
            "subscribe",
            () =>
              new Promise((resolve, reject) => {
                unsubscribes.push(
                  client.onUpdate(
                    ref(name),
                    args,
                    (value) => {
                      update(value);
                      resolve();
                    },
                    () => {
                      result.subscriptionErrors =
                        (result.subscriptionErrors ?? 0) + 1;
                      reject(Error("Subscription failed"));
                    },
                  ),
                );
              }),
          ),
        );
      }
    }
    await Promise.all(ready);
    const holdStart = performance.now();
    await Promise.all(
      clients.map(async (client, i) => {
        const args = { token: tokens[i], eventId: event._id };
        for (const extra of [{ profile: 0, confirm: false }, { confirm: true }])
          await measure(result.records, "gate", async () =>
            requireOk(
              await client.mutation(ref("guest:gate"), { ...args, ...extra }),
            ),
          );
      }),
    );
    const votes = [];
    result.voteBatchOffsetsMs = [];
    await paceBatches(15, 1000, (batch, offsetMs) => {
      const batchStart = performance.now();
      result.voteBatchOffsetsMs.push(offsetMs);
      checkpoints.push({ total: (batch + 1) * 20, started: batchStart });
      votes.push(
        Promise.allSettled(
          Array.from({ length: 20 }, (_, j) => {
            const ordinal = batch * 20 + j,
              i = ordinal % 100;
            return measure(result.records, "vote", async () =>
              requireOk(
                await clients[i].mutation(ref("guest:requestOrVote"), {
                  token: tokens[i],
                  eventId: event._id,
                  trackId: `staging-song-${(i + Math.floor(ordinal / 100)) % 10}`,
                }),
              ),
            );
          }),
        ),
      );
    });
    await Promise.all(votes);
    const deadline = performance.now() + 30000;
    while (
      performance.now() < deadline &&
      checkpointDeliveries.length < result.expectedObservations
    )
      await sleep(100);
    let nextProgress = holdStart;
    do {
      const tick = performance.now();
      await Promise.allSettled(
        clients.map((client, i) =>
          measure(result.records, "cached-search", async () => {
            const response = await client.action(ref("services:localSearch"), {
              token: tokens[i],
              eventId: event._id,
              term: "synthetic",
            });
            if (
              response.error ||
              !Array.isArray(response.tracks) ||
              !response.tracks.length
            )
              throw Error("Cached search failed");
          }),
        ),
      );
      await sleep(
        Math.max(
          0,
          Math.min(
            15000 - (performance.now() - tick),
            holdStart + holdMs - performance.now(),
          ),
        ),
      );
      if (performance.now() >= nextProgress) {
        console.log(
          JSON.stringify({
            scenario,
            repeat,
            phase: "connected hold",
            elapsedSeconds: Math.round((performance.now() - holdStart) / 1000),
            observations: checkpointDeliveries.length,
            failedOperations: result.records.filter((r) => !r.ok).length,
          }),
        );
        nextProgress = performance.now() + 60000;
      }
    } while (performance.now() < holdStart + holdMs);
    result.connectedElapsedMs = performance.now() - holdStart;
    result.finalVotes = (
      await query("guest:leaderboard", { eventId: event._id, limit: 50 })
    ).reduce((sum, row) => sum + row.votes, 0);
    await Promise.all(
      tokens.map((token) =>
        measure(result.records, "verify-participation", async () => {
          const p = await query("guest:participation", {
            token,
            eventId: event._id,
          });
          if (p.used !== 3 || new Set(p.votes).size !== 3)
            throw Error("Incorrect guest budget");
        }),
      ),
    );
  } catch {
    result.error =
      "Scenario setup or execution failed; inspect operation counts and staging logs";
  } finally {
    result.arrivals = checkpointDeliveries;
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    await Promise.allSettled(
      clients.map((client) => bounded(() => client.close())),
    );
    clients.forEach((client) => activeClients.delete(client));
    result.elapsedMs = performance.now() - started;
    result.throughputPerSecond =
      result.records.filter((r) => r.ok).length / (result.elapsedMs / 1000);
    result.latency = Object.fromEntries(
      [...new Set(result.records.map((r) => r.kind))].map((kind) => [
        kind,
        summarize(
          result.records
            .filter((r) => r.kind === kind && r.ok)
            .map((r) => r.ms),
        ),
      ]),
    );
    result.failures = evaluate(result, thresholds);
    if (result.error) result.failures.push(result.error);
    result.passed = result.failures.length === 0;
    await save();
    console.log(
      JSON.stringify({
        scenario,
        repeat,
        passed: result.passed,
        failures: result.failures,
      }),
    );
  }
}

async function disableFlag() {
  try {
    const response = await fetch(`${url}/api/update_environment_variables`, {
      method: "POST",
      headers: {
        Authorization: `Convex ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        changes: [{ name: "WELIST_STAGING_LOAD_TEST", value: "false" }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok || (await query("staging:enabled")))
      throw Error("Cleanup failed");
    return "staging flag disabled and verified";
  } catch {
    return "FAILED: manually disable WELIST_STAGING_LOAD_TEST on the isolated deployment";
  }
}

let interrupting = false;
async function interrupt() {
  if (interrupting) return;
  interrupting = true;
  report.error =
    "Run interrupted; incomplete scenarios are not passing results";
  await Promise.allSettled(
    [...activeClients].map((client) => bounded(() => client.close())),
  );
  if (verified) report.cleanup = await disableFlag();
  report.finishedAt = new Date().toISOString();
  await save();
  process.exit(130);
}
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

try {
  if (!url || !key || !values["i-understand-staging"])
    throw Error("Missing explicit staging configuration");
  if (!/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(url))
    throw Error("Expected explicit staging cloud origin");
  http = new ConvexHttpClient(url, { logger: false });
  admin = new ConvexHttpClient(url, { logger: false });
  admin.setAdminAuth(key);
  assertStaging(await query("staging:enabled"), await query("guest:current"));
  verified = true;
  for (const scenario of scenarios)
    for (let repeat = 1; repeat <= repeats; repeat++) {
      if (report.runs.length) await sleep(61000);
      await run(scenario, repeat);
    }
} catch {
  report.error =
    "Staging preflight failed: require WELIST_STAGING_URL, WELIST_STAGING_DEPLOY_KEY, --i-understand-staging, enabled flag and live synthetic event";
} finally {
  if (verified) report.cleanup = await disableFlag();
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(`Load report: ${reportPath}`);
  if (
    report.error ||
    report.runs.some((r) => !r.passed) ||
    report.cleanup.startsWith("FAILED")
  )
    process.exitCode = 1;
}
