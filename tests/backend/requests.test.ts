import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { digest } from "../../convex/platform/hashing";
import { setup, unlock } from "../support/backend";
it("records one vote for simultaneous duplicate submissions by the same guest", async () => {
  const { t, eventId } = await setup();
  await unlock(t, eventId);
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      t.mutation(api.requests.mutations.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "song0",
      }),
    ),
  );
  expect(results.map((r) => (r.ok ? "OK" : r.error.code)).sort()).toEqual([
    "DUPLICATE",
    "DUPLICATE",
    "DUPLICATE",
    "OK",
  ]);
  expect(
    await t.query(api.participation.queries.participation, {
      token: "guest",
      eventId,
    }),
  ).toMatchObject({ used: 1, votes: ["song0"] });
  expect(
    await t.query(api.requests.queries.leaderboard, { eventId, limit: 50 }),
  ).toMatchObject([{ votes: 1 }]);
});

it("never spends a fourth vote and preserves duplicate idempotency", async () => {
  const { t, eventId } = await setup();
  await unlock(t, eventId);
  for (let i = 0; i < 2; i++)
    expect(
      await t.mutation(api.requests.mutations.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "song" + i,
      }),
    ).toEqual({ ok: true, data: null });
  const result = await Promise.all(
    [2, 3].map((i) =>
      t.mutation(api.requests.mutations.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "song" + i,
      }),
    ),
  );
  expect(result.map((r) => (r.ok ? "OK" : r.error.code)).sort()).toEqual([
    "EXHAUSTED",
    "OK",
  ]);
  expect(
    await t.mutation(api.requests.mutations.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "song0",
    }),
  ).toEqual({ ok: false, error: { code: "DUPLICATE" } });
  expect(
    (
      await t.query(api.participation.queries.participation, {
        token: "guest",
        eventId,
      })
    ).used,
  ).toBe(3);
});

it("creates one request with two votes for concurrent guests", async () => {
  const { t, eventId } = await setup();
  await unlock(t, eventId);
  await unlock(t, eventId, "other");
  await Promise.all(
    ["guest", "other"].map((token) =>
      t.mutation(api.requests.mutations.requestOrVote, {
        token,
        eventId,
        trackId: "song0",
      }),
    ),
  );
  const rows = await t.query(api.requests.queries.leaderboard, {
    eventId,
    limit: 50,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].votes).toBe(2);
  expect(rows[0]).not.toHaveProperty("creator");
});

it("archives without refund and undo restores votes", async () => {
  const { t, admin, eventId } = await setup();
  await unlock(t, eventId);
  await unlock(t, eventId, "other");
  await t.mutation(api.requests.mutations.requestOrVote, {
    token: "guest",
    eventId,
    trackId: "song0",
  });
  const [r] = await t.query(api.requests.queries.leaderboard, {
    eventId,
    limit: 50,
  });
  await admin.mutation(api.requests.mutations.setArchived, {
    eventId,
    requestId: r._id,
    undo: false,
  });
  expect(
    await t.mutation(api.requests.mutations.requestOrVote, {
      token: "other",
      eventId,
      trackId: "song0",
    }),
  ).toEqual({ ok: false, error: { code: "ARCHIVED" } });
  expect(
    (
      await t.query(api.participation.queries.participation, {
        token: "guest",
        eventId,
      })
    ).used,
  ).toBe(1);
  expect(
    (
      await t.query(api.participation.queries.participation, {
        token: "guest",
        eventId,
      })
    ).votedTracks,
  ).toMatchObject([{ trackId: "song0", title: "Song 0", archived: true }]);
  await admin.mutation(api.requests.mutations.setArchived, {
    eventId,
    requestId: r._id,
    undo: true,
  });
  expect(
    (await t.query(api.requests.queries.leaderboard, { eventId, limit: 50 }))[0]
      .votes,
  ).toBe(1);
  expect(
    (
      await t.query(api.participation.queries.participation, {
        token: "guest",
        eventId,
      })
    ).votedTracks,
  ).toMatchObject([{ trackId: "song0", archived: false }]);
});

it("rejects expired undo and forged administrator credentials", async () => {
  const { t, admin, eventId } = await setup();
  await unlock(t, eventId);
  await t.mutation(api.requests.mutations.requestOrVote, {
    token: "guest",
    eventId,
    trackId: "song0",
  });
  const [r] = await t.query(api.requests.queries.leaderboard, {
    eventId,
    limit: 50,
  });
  await t.run((ctx) =>
    ctx.db.patch(r._id, { archived: true, removedAt: Date.now() - 11000 }),
  );
  await expect(
    admin.mutation(api.requests.mutations.setArchived, {
      eventId,
      requestId: r._id,
      undo: true,
    }),
  ).resolves.toMatchObject({ ok: false, error: { code: "UNDO_EXPIRED" } });
  await expect(
    t.mutation(api.events.mutations.endEvent, { eventId }),
  ).rejects.toThrow();
  await expect(
    t
      .withIdentity({ subject: "forged|session" })
      .mutation(api.events.mutations.endEvent, { eventId }),
  ).rejects.toThrow();
});

it("handles 100 simulated guests in batches of 20 without losing votes", async () => {
  const { t, eventId } = await setup();
  const guestIds = await t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 100; i++) {
      const id = await ctx.db.insert("sessions", {
        hash: digest("load" + i),
        role: "guest",
        expiresAt: Date.now() + 3600000,
      });
      await ctx.db.insert("participation", {
        guestId: id,
        eventId,
        clicks: [0, 1],
        unlocked: true,
        used: 0,
      });
      ids.push(id);
    }
    return ids;
  });
  const started = performance.now();
  for (let batch = 0; batch < 5; batch++) {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        t.mutation(api.requests.mutations.requestOrVote, {
          token: "load" + (batch * 20 + i),
          eventId,
          trackId: "song" + (i % 6),
        }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
  }
  const rows = await t.query(api.requests.queries.leaderboard, {
    eventId,
    limit: 50,
  });
  expect(rows.reduce((n: number, r: { votes: number }) => n + r.votes, 0)).toBe(
    100,
  );
  expect(guestIds).toHaveLength(100);
  console.log(
    "Emulator only: 100 guests, 20 concurrent writes/batch, elapsed ms:",
    Math.round(performance.now() - started),
  );
});
