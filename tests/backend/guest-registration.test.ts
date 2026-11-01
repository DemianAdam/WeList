import { createBackend } from "../support/backend";
import { expectData } from "../support/results";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { digest } from "../../convex/platform/hashing";
import { guestAdmissionConfig } from "../../convex/sessions/admission";
const credential = (n = 1) => ({
  bootstrapToken: n.toString(16).padStart(64, "0"),
  operationId: crypto.randomUUID(),
});
function setup() {
  const t = createBackend();
  return t;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("concurrent duplicates commit one hashed session and consume capacity once", async () => {
  vi.stubEnv("GUEST_SESSIONS_PER_MINUTE", "1");
  const t = setup(),
    args = credential();
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      t.mutation(api.sessions.mutations.registerSession, args),
    ),
  );
  expect(results.filter((r) => r.ok && !r.data.reused)).toHaveLength(1);
  expect(results.every((r) => r.ok)).toBe(true);
  const rows = await t.run((ctx) => ctx.db.query("sessions").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].hash).toBe(digest(args.bootstrapToken));
  expect(JSON.stringify(rows)).not.toContain(args.bootstrapToken);
  expect(
    await t.mutation(api.sessions.mutations.registerSession, credential(2)),
  ).toMatchObject({
    ok: false,
    error: { code: "RATE_LIMITED", retryAfterMs: expect.any(Number) },
  });
  // A lost successful response can be recovered even when admission is full.
  expect(
    await t.mutation(api.sessions.mutations.registerSession, args),
  ).toEqual({
    ok: true,
    data: { reused: true },
  });
});

it("reuses the same expiry and shares a refillable bucket with legacy issuance", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
  vi.stubEnv("GUEST_SESSIONS_PER_MINUTE", "1");
  const t = setup(),
    args = credential();
  await t.mutation(api.sessions.mutations.registerSession, args);
  const before = await t.run((ctx) => ctx.db.query("sessions").first());
  expect(
    await t.mutation(api.sessions.mutations.issueSession, {}),
  ).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  vi.setSystemTime(Date.now() + 61000);
  expect(
    await t.mutation(api.sessions.mutations.registerSession, args),
  ).toMatchObject({
    data: { reused: true },
  });
  expect(
    (await t.run((ctx) => ctx.db.query("sessions").first()))!.expiresAt,
  ).toBe(before!.expiresAt);
  expect(
    expectData(await t.mutation(api.sessions.mutations.issueSession, {})).token,
  ).toMatch(/^[a-f0-9]{64}$/);
  expect(
    await t.mutation(api.sessions.mutations.registerSession, credential(2)),
  ).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
});

it("rejects malformed inputs and other roles; expired identities are not renewed", async () => {
  const t = setup(),
    args = credential();
  await expect(
    t.mutation(api.sessions.mutations.registerSession, {
      ...args,
      bootstrapToken: "short",
    }),
  ).rejects.toThrow("VALIDATION_ERROR");
  await expect(
    t.mutation(api.sessions.mutations.registerSession, {
      ...args,
      operationId: "not-a-uuid",
    }),
  ).rejects.toThrow("VALIDATION_ERROR");
  const id = await t.run((ctx) =>
    ctx.db.insert("sessions", {
      hash: digest(args.bootstrapToken),
      role: "guest",
      expiresAt: Date.now() - 1,
    }),
  );
  await expect(
    t.mutation(api.sessions.mutations.registerSession, args),
  ).rejects.toMatchObject({ data: { code: "SESSION_EXPIRED" } });
  await t.run((ctx) =>
    ctx.db.patch(id, { role: "admin", expiresAt: Date.now() + 60000 }),
  );
  await expect(
    t.mutation(api.sessions.mutations.registerSession, args),
  ).rejects.toThrow("VALIDATION_ERROR");
});

it("validates configuration and caps shards without silently increasing limits", async () => {
  expect(guestAdmissionConfig()).toMatchObject({
    rate: 1000,
    capacity: 1000,
    shards: 64,
  });
  vi.stubEnv("GUEST_SESSIONS_PER_MINUTE", "5");
  vi.stubEnv("GUEST_SESSION_BURST_CAPACITY", "2");
  expect(guestAdmissionConfig()).toMatchObject({
    rate: 5,
    capacity: 2,
    shards: 2,
  });
  const t = setup();
  for (const [name, value] of [
    ["GUEST_SESSIONS_PER_MINUTE", "0"],
    ["GUEST_SESSION_BURST_CAPACITY", "NaN"],
    ["GUEST_SESSION_LIMIT_SHARDS", "257"],
  ]) {
    vi.stubEnv(name!, value!);
    await expect(
      t.mutation(api.sessions.mutations.registerSession, credential()),
    ).rejects.toThrow("CONFIGURATION_ERROR");
    vi.unstubAllEnvs();
  }
  expect(await t.run((ctx) => ctx.db.query("sessions").collect())).toHaveLength(
    0,
  );
});

it("logs only correlation and outcome fields", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const t = setup(),
    args = credential();
  await t.mutation(api.sessions.mutations.registerSession, args);
  const output = log.mock.calls.flat().join(" ");
  expect(output).toContain(args.operationId);
  expect(output).not.toContain(args.bootstrapToken);
  expect(output).not.toContain(digest(args.bootstrapToken));
});
