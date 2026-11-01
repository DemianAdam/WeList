// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertStaging,
  bounded,
  evaluate,
  measure,
  observeCheckpoints,
  paceBatches,
  requireOk,
  summarize,
} from "../scripts/load-core.mjs";

const valid = () => ({
  records: [{ kind: "session", ok: true, ms: 100 }],
  sessionSuccesses: 1,
  expectedSessions: 1,
  finalVotes: 3,
  expectedVotes: 3,
  arrivals: [100],
  expectedObservations: 1,
});
describe("load runner acceptance", () => {
  it("uses the shared redacting recorder for registration diagnostics", async () => {
    const records = [];
    const operationId = "12345678-1234-4234-8234-123456789abc";
    await measure(
      records,
      "session",
      () => ({ status: "OK", reused: true }),
      100,
      {
        operationId,
        attempt: 2,
        bootstrapToken: "secret",
        password: "private",
      },
    );
    expect(records).toMatchObject([
      { operationId, attempt: 2, outcome: "REUSED", ok: true },
    ]);
    expect(JSON.stringify(records)).not.toMatch(
      /secret|private|bootstrapToken|password/,
    );
  });
  it("never hides raw failures behind recovery injection metadata", () => {
    const failed = {
      ...valid(),
      scenario: "burst",
      records: [{ kind: "session", ok: false, ms: 1, expectedInjection: true }],
    };
    expect(evaluate(failed)).toContain("Unexpected operation failures");
    expect(evaluate({ ...failed, scenario: "recovery" })).not.toContain(
      "Unexpected operation failures",
    );
  });
  it("launches at the requested rate without waiting for slow operations", async () => {
    let time = 0;
    const launches = [];
    await paceBatches(
      3,
      1000,
      (index, offset) => {
        launches.push([index, offset]);
        return new Promise(() => {});
      },
      {
        now: () => time,
        wait: async (ms) => {
          time += ms;
        },
      },
    );
    expect(launches).toEqual([
      [0, 0],
      [1, 1000],
      [2, 2000],
    ]);
  });
  it("refuses disabled staging and non-test events", () => {
    expect(() =>
      assertStaging(false, {
        name: "Synthetic staging load test",
        status: "live",
      }),
    ).toThrow("disabled");
    expect(() =>
      assertStaging(true, { name: "Real party", status: "live" }),
    ).toThrow("synthetic");
    expect(() =>
      assertStaging(true, {
        name: "Synthetic staging load test",
        status: "ended",
      }),
    ).toThrow();
  });
  it("bounds stalled operations and records timeouts", async () => {
    const records = [];
    await expect(
      measure(records, "session", () => new Promise(() => {}), 10),
    ).rejects.toThrow("timeout");
    expect(records).toMatchObject([{ ok: false, error: "TIMEOUT" }]);
    await expect(bounded(() => Promise.resolve(7), 50)).resolves.toBe(7);
  });
  it("counts rejected mutation responses as failures, even after successful retries", async () => {
    const result = valid();
    await expect(
      measure(result.records, "vote", () => requireOk("EXHAUSTED")),
    ).rejects.toThrow();
    await measure(result.records, "vote", () => requireOk("OK"));
    expect(evaluate(result)).toContain("Unexpected operation failures");
  });
  it("fails incorrect vote totals and missing observations", () => {
    expect(evaluate({ ...valid(), finalVotes: 2 })).toContain(
      "Incorrect final vote total",
    );
    expect(evaluate({ ...valid(), arrivals: [] })).toContain(
      "Missing subscription observations",
    );
  });
  it("fails latency violations and subscription errors", () => {
    expect(
      evaluate({ ...valid(), arrivals: [31000], subscriptionErrors: 1 }),
    ).toHaveLength(3);
    expect(
      evaluate({
        ...valid(),
        records: [{ kind: "session", ok: true, ms: 2001 }],
      }),
    ).toContain("session p95 exceeds 2000ms");
    expect(evaluate(valid())).toEqual([]);
  });
  it("counts coalesced updates once per client and checkpoint", () => {
    const seen = new Set(),
      arrivals = [];
    const checkpoints = [
      { total: 20, started: 10 },
      { total: 40, started: 20 },
    ];
    observeCheckpoints(checkpoints, seen, 40, 100, arrivals);
    observeCheckpoints(checkpoints, seen, 40, 200, arrivals);
    expect(arrivals).toEqual([90, 80]);
    expect(summarize([]).p95Ms).toBeNull();
    expect(summarize([3, 1, 2]).p95Ms).toBe(3);
  });
});
