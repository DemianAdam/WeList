import { expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { digest } from "../../convex/platform/hashing";
import { expectData } from "../support/results";
import { setup, unlock, createBackend } from "../support/backend";
it("rejects expired-session gate and participation access without changing votes", async () => {
  const { t, eventId } = await setup();
  await unlock(t, eventId);
  await t.mutation(api.requests.mutations.requestOrVote, {
    token: "guest",
    eventId,
    trackId: "song0",
  });
  await t.run(async (ctx) => {
    const s = await ctx.db
      .query("sessions")
      .withIndex("hash", (q) => q.eq("hash", digest("guest")))
      .unique();
    await ctx.db.patch(s!._id, { expiresAt: Date.now() - 1 });
  });
  await expect(
    t.query(api.participation.queries.participation, {
      token: "guest",
      eventId,
    }),
  ).rejects.toThrow("SESSION_EXPIRED");
  await expect(
    t.mutation(api.participation.mutations.updateGate, {
      token: "guest",
      eventId,
      confirm: true,
    }),
  ).rejects.toThrow("SESSION_EXPIRED");
  expect(
    await t.query(api.requests.queries.leaderboard, { eventId, limit: 50 }),
  ).toMatchObject([{ votes: 1 }]);
});

it("rejects untrusted tracks and expired guest sessions", async () => {
  const { t, eventId } = await setup();
  await unlock(t, eventId);
  expect(
    await t.mutation(api.requests.mutations.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "forged",
    }),
  ).toEqual({ ok: false, error: { code: "INVALID_TRACK" } });
  await t.run(async (ctx) => {
    const s = await ctx.db
      .query("sessions")
      .withIndex("hash", (q) => q.eq("hash", digest("guest")))
      .unique();
    await ctx.db.patch(s!._id, { expiresAt: 0 });
  });
  await expect(
    t.mutation(api.requests.mutations.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "song0",
    }),
  ).rejects.toThrow();
});

it("issues 500 guest sessions and enforces a configured ceiling", async () => {
  const t = createBackend();
  vi.stubEnv("GUEST_SESSIONS_PER_MINUTE", "1000");
  try {
    const tokens = [];
    for (let i = 0; i < 25; i++)
      tokens.push(
        ...(await Promise.all(
          Array.from({ length: 20 }, () =>
            t.mutation(api.sessions.mutations.issueSession, {}),
          ),
        )),
      );
    expect(new Set(tokens.map((result) => expectData(result).token)).size).toBe(
      500,
    );
    vi.stubEnv("GUEST_SESSIONS_PER_MINUTE", "1");
    const limited = createBackend();
    expect(
      await limited.mutation(api.sessions.mutations.issueSession, {}),
    ).not.toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(
      await limited.mutation(api.sessions.mutations.issueSession, {}),
    ).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  } finally {
    vi.unstubAllEnvs();
  }
});
