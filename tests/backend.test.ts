import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { digest } from "../convex/lib/security";
// Marker supplies convex-test's module root without pretending codegen has run.
const modules = {
  ...import.meta.glob("../convex/**/*.ts"),
  "../convex/_generated/test-root.ts": async () => ({}),
};
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "admin@welist.local",
    });
    await ctx.db.insert("administrators", { key: "pilot", userId });
    for (const token of ["guest", "other"])
      await ctx.db.insert("sessions", {
        hash: digest(token),
        role: "guest",
        expiresAt: Date.now() + 3600000,
      });
    return userId;
  });
  const admin = t.withIdentity({ subject: userId + "|session" });
  const eventId = await admin.mutation(anyApi.admin.start, {
    name: "Test night",
    profiles: ["one", "two"],
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 6; i++)
      await ctx.db.insert("eventTracks", {
        eventId,
        trackId: "song" + i,
        title: "Song " + i,
        artist: "Artist",
        searchText: "song " + i + " artist",
        url: "https://open.spotify.com/track/" + i,
        expiresAt: Date.now() + 3600000,
      });
  });
  return { t, admin, eventId };
}
async function unlock(
  t: Awaited<ReturnType<typeof setup>>["t"],
  eventId: string,
  token = "guest",
) {
  for (const profile of [0, 1])
    await t.mutation(anyApi.guest.gate, {
      token,
      eventId,
      profile,
      confirm: false,
    });
  await t.mutation(anyApi.guest.gate, { token, eventId, confirm: true });
}
describe("transactional event rules", () => {
  it("allows one required Instagram profile and unlocks after that visit", async () => {
    const { t, admin, eventId } = await setup();
    await admin.mutation(anyApi.admin.end, { eventId });
    const oneProfileEvent = await admin.mutation(anyApi.admin.start, {
      name: "One profile",
      profiles: ["one"],
    });
    expect(
      await t.mutation(anyApi.guest.gate, {
        token: "guest",
        eventId: oneProfileEvent,
        profile: 1,
        confirm: false,
      }),
    ).toBe("INVALID_PROFILE");
    await t.mutation(anyApi.guest.gate, {
      token: "guest",
      eventId: oneProfileEvent,
      profile: 0,
      confirm: false,
    });
    expect(
      await t.mutation(anyApi.guest.gate, {
        token: "guest",
        eventId: oneProfileEvent,
        confirm: true,
      }),
    ).toBe("OK");
  });

  it("requires both visits and explicit confirmation", async () => {
    const { t, eventId } = await setup();
    expect(
      await t.mutation(anyApi.guest.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "song0",
      }),
    ).toBe("GATE_REQUIRED");
    await t.mutation(anyApi.guest.gate, {
      token: "guest",
      eventId,
      profile: 0,
      confirm: false,
    });
    expect(
      await t.mutation(anyApi.guest.gate, {
        token: "guest",
        eventId,
        confirm: true,
      }),
    ).toBe("GATE_REQUIRED");
    await unlock(t, eventId);
    expect(
      (await t.query(anyApi.guest.participation, { token: "guest", eventId }))
        .unlocked,
    ).toBe(true);
  });
  it("never spends a fourth vote and preserves duplicate idempotency", async () => {
    const { t, eventId } = await setup();
    await unlock(t, eventId);
    for (let i = 0; i < 2; i++)
      expect(
        await t.mutation(anyApi.guest.requestOrVote, {
          token: "guest",
          eventId,
          trackId: "song" + i,
        }),
      ).toBe("OK");
    const result = await Promise.all(
      [2, 3].map((i) =>
        t.mutation(anyApi.guest.requestOrVote, {
          token: "guest",
          eventId,
          trackId: "song" + i,
        }),
      ),
    );
    expect(result.sort()).toEqual(["EXHAUSTED", "OK"]);
    expect(
      await t.mutation(anyApi.guest.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "song0",
      }),
    ).toBe("DUPLICATE");
    expect(
      (await t.query(anyApi.guest.participation, { token: "guest", eventId }))
        .used,
    ).toBe(3);
  });
  it("creates one request with two votes for concurrent guests", async () => {
    const { t, eventId } = await setup();
    await unlock(t, eventId);
    await unlock(t, eventId, "other");
    await Promise.all(
      ["guest", "other"].map((token) =>
        t.mutation(anyApi.guest.requestOrVote, {
          token,
          eventId,
          trackId: "song0",
        }),
      ),
    );
    const rows = await t.query(anyApi.guest.leaderboard, {
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
    await t.mutation(anyApi.guest.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "song0",
    });
    const [r] = await t.query(anyApi.guest.leaderboard, { eventId, limit: 50 });
    await admin.mutation(anyApi.admin.archive, {
      eventId,
      requestId: r._id,
      undo: false,
    });
    expect(
      await t.mutation(anyApi.guest.requestOrVote, {
        token: "other",
        eventId,
        trackId: "song0",
      }),
    ).toBe("ARCHIVED");
    expect(
      (await t.query(anyApi.guest.participation, { token: "guest", eventId }))
        .used,
    ).toBe(1);
    await admin.mutation(anyApi.admin.archive, {
      eventId,
      requestId: r._id,
      undo: true,
    });
    expect(
      (await t.query(anyApi.guest.leaderboard, { eventId, limit: 50 }))[0]
        .votes,
    ).toBe(1);
  });
  it("rejects expired undo and forged administrator credentials", async () => {
    const { t, admin, eventId } = await setup();
    await unlock(t, eventId);
    await t.mutation(anyApi.guest.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "song0",
    });
    const [r] = await t.query(anyApi.guest.leaderboard, { eventId, limit: 50 });
    await t.run((ctx) =>
      ctx.db.patch(r._id, { archived: true, removedAt: Date.now() - 11000 }),
    );
    await expect(
      admin.mutation(anyApi.admin.archive, {
        eventId,
        requestId: r._id,
        undo: true,
      }),
    ).rejects.toThrow();
    await expect(t.mutation(anyApi.admin.end, { eventId })).rejects.toThrow();
    await expect(
      t
        .withIdentity({ subject: "forged|session" })
        .mutation(anyApi.admin.end, { eventId }),
    ).rejects.toThrow();
  });
  it("closes old events and resets participation for a new event", async () => {
    const { t, admin, eventId } = await setup();
    await unlock(t, eventId);
    await admin.mutation(anyApi.admin.end, { eventId });
    await expect(
      t.mutation(anyApi.guest.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "song0",
      }),
    ).rejects.toThrow();
    const next = await admin.mutation(anyApi.admin.start, {
      name: "Next",
      profiles: ["one", "two"],
    });
    expect(
      await t.query(anyApi.guest.participation, {
        token: "guest",
        eventId: next,
      }),
    ).toMatchObject({ used: 0, unlocked: false });
  });
  it("rejects untrusted tracks and expired guest sessions", async () => {
    const { t, eventId } = await setup();
    await unlock(t, eventId);
    expect(
      await t.mutation(anyApi.guest.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "forged",
      }),
    ).toBe("INVALID_TRACK");
    await t.run(async (ctx) => {
      const s = await ctx.db
        .query("sessions")
        .withIndex("hash", (q) => q.eq("hash", digest("guest")))
        .unique();
      await ctx.db.patch(s!._id, { expiresAt: 0 });
    });
    await expect(
      t.mutation(anyApi.guest.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "song0",
      }),
    ).rejects.toThrow();
  });
  it("cleans up events only after thirty days", async () => {
    const { t, admin, eventId } = await setup();
    await admin.mutation(anyApi.admin.end, { eventId });
    await t.mutation(anyApi.cleanup.run, {});
    expect(await t.run((ctx) => ctx.db.get(eventId))).not.toBeNull();
    await t.run((ctx) =>
      ctx.db.patch(eventId, { endedAt: Date.now() - 31 * 86400000 }),
    );
    await t.mutation(anyApi.cleanup.run, {});
    expect(await t.run((ctx) => ctx.db.get(eventId))).toBeNull();
  });
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
        t.mutation(anyApi.guest.requestOrVote, {
          token: "load" + (batch * 20 + i),
          eventId,
          trackId: "song" + (i % 6),
        }),
      ),
    );
    expect(results.every((r) => r === "OK")).toBe(true);
  }
  const rows = await t.query(anyApi.guest.leaderboard, { eventId, limit: 50 });
  expect(rows.reduce((n: number, r: { votes: number }) => n + r.votes, 0)).toBe(
    100,
  );
  expect(guestIds).toHaveLength(100);
  console.log(
    "Emulator only: 100 guests, 20 concurrent writes/batch, elapsed ms:",
    Math.round(performance.now() - started),
  );
});

it("local leaderboard searches do not consume Spotify quota", async () => {
  const { t, eventId } = await setup();
  await unlock(t, eventId);
  await t.mutation(anyApi.guest.requestOrVote, {
    token: "guest",
    eventId,
    trackId: "song0",
  });
  for (let i = 0; i < 35; i++)
    expect(
      await t.query(anyApi.internal.localSearch, { eventId, term: "song" }),
    ).toHaveLength(1);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("limits")
        .withIndex("key", (q) => q.eq("key", "spotify-global"))
        .unique(),
    ),
  ).toBeNull();
});

it("rate-limits remote search attempts and honors global cooldown", async () => {
  const { t, eventId } = await setup();
  for (let i = 0; i < 30; i++)
    expect(
      await t.mutation(anyApi.internal.searchPermit, {
        token: "guest",
        eventId,
      }),
    ).not.toHaveProperty("error");
  expect(
    await t.mutation(anyApi.internal.searchPermit, {
      token: "guest",
      eventId,
    }),
  ).toEqual({ error: "RATE_LIMITED" });
  await t.mutation(anyApi.internal.saveProvider, {
    expiresAt: 0,
    blockedUntil: Date.now() + 60000,
  });
  expect(
    await t.mutation(anyApi.internal.searchLease, {
      key: "absent",
      owner: "one",
    }),
  ).toEqual({ error: "SEARCH_UNAVAILABLE" });
});

it("only permits the explicitly authorized identity, even if another user is authenticated", async () => {
  const { t, admin, eventId } = await setup();
  expect(await admin.query(anyApi.admin.dashboard, {})).not.toBeNull();
  const otherId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "other@example.test" }),
  );
  await expect(
    t
      .withIdentity({ subject: otherId + "|session" })
      .query(anyApi.admin.dashboard, {}),
  ).rejects.toThrow();
  await expect(t.mutation(anyApi.admin.end, { eventId })).rejects.toThrow();
  await t.mutation(anyApi.provision.revoke, {});
  await expect(admin.query(anyApi.admin.dashboard, {})).rejects.toThrow();
  await t.mutation(anyApi.provision.authorize, { userId: otherId });
  expect(
    await t
      .withIdentity({ subject: otherId + "|session" })
      .query(anyApi.admin.dashboard, {}),
  ).not.toBeNull();
});

it("provisions and reprovisions the DJ account while public signup is disabled", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(anyApi.auth.signIn, {
      provider: "password",
      params: {
        flow: "signUp",
        email: "attacker@example.test",
        password: "long-password-123",
      },
    }),
  ).rejects.toThrow();
  await t.action(anyApi.provision.setup, {
    password: "first-strong-password-123",
  });
  const account = await t.query(anyApi.provision.account, {});
  const admins = await t.run((ctx) => ctx.db.query("administrators").collect());
  expect(admins[0].userId).toBe(account!.userId);
  await t.action(anyApi.provision.setup, {
    password: "second-strong-password-456",
  });
  expect((await t.query(anyApi.provision.account, {}))!.userId).toBe(
    account!.userId,
  );
});

it("issues 500 distinct real guest sessions and enforces the configured ceiling", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("GUEST_SESSIONS_PER_MINUTE", "500");
  try {
    const tokens = [];
    for (let i = 0; i < 25; i++)
      tokens.push(
        ...(await Promise.all(
          Array.from({ length: 20 }, () =>
            t.mutation(anyApi.guest.issueSession, {}),
          ),
        )),
      );
    expect(new Set(tokens).size).toBe(500);
    expect(await t.mutation(anyApi.guest.issueSession, {})).toBe(
      "RATE_LIMITED",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});

it("coalesces cache misses, caches empty responses, and protects against stale lease owners", async () => {
  const { t } = await setup();
  const key = "one song";
  const first = await t.mutation(anyApi.internal.searchLease, {
    key,
    owner: "first",
  });
  expect(first).not.toHaveProperty("waiting");
  expect(
    await t.mutation(anyApi.internal.searchLease, { key, owner: "second" }),
  ).toEqual({ waiting: true });
  expect(
    await t.mutation(anyApi.internal.cacheSearch, {
      key,
      owner: "second",
      tracks: [],
    }),
  ).toBe(false);
  expect(
    await t.mutation(anyApi.internal.cacheSearch, {
      key,
      owner: "first",
      tracks: [],
    }),
  ).toBe(true);
  expect(
    await t.mutation(anyApi.internal.searchLease, { key, owner: "second" }),
  ).toEqual({ tracks: [] });
  await t.run(async (ctx) => {
    const cache = await ctx.db
      .query("cache")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
    await ctx.db.patch(cache!._id, { expiresAt: 0 });
  });
  expect(
    await t.mutation(anyApi.internal.searchLease, { key, owner: "second" }),
  ).not.toHaveProperty("tracks");
  await t.mutation(anyApi.internal.releaseSearchLease, {
    key,
    owner: "second",
  });
  expect(
    await t.mutation(anyApi.internal.searchLease, { key, owner: "third" }),
  ).not.toHaveProperty("waiting");
});

it("normalizes catalog searches and reuses successful provider results", async () => {
  const { t, eventId } = await setup();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test");
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("accounts.spotify.com"))
      return new Response(
        JSON.stringify({ access_token: "access", expires_in: 3600 }),
        { status: 200 },
      );
    return new Response(JSON.stringify({ tracks: { items: [] } }), {
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    const a = await t.action(anyApi.services.search, {
      token: "guest",
      eventId,
      term: "  Daft   PUNK ",
    });
    const b = await t.action(anyApi.services.search, {
      token: "other",
      eventId,
      term: "daft punk",
    });
    expect(a.tracks).toEqual([]);
    expect(b).toMatchObject({ tracks: [], source: "cache" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("shares an in-flight provider search and never caches provider failures", async () => {
  const { t, eventId } = await setup();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test");
  let fail = false;
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("accounts.spotify.com"))
      return new Response(
        JSON.stringify({ access_token: "access", expires_in: 3600 }),
        { status: 200 },
      );
    await new Promise((resolve) => setTimeout(resolve, 75));
    return fail
      ? new Response("unavailable", { status: 503 })
      : new Response(JSON.stringify({ tracks: { items: [] } }), {
          status: 200,
        });
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    const results = await Promise.all(
      ["guest", "other"].map((token) =>
        t.action(anyApi.services.search, {
          token,
          eventId,
          term: "shared search",
        }),
      ),
    );
    expect(results.every((result) => Array.isArray(result.tracks))).toBe(true);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes("api.spotify.com"),
      ),
    ).toHaveLength(1);
    fail = true;
    expect(
      await t.action(anyApi.services.search, {
        token: "guest",
        eventId,
        term: "failure",
      }),
    ).toMatchObject({ error: "SEARCH_UNAVAILABLE" });
    expect(
      await t.action(anyApi.services.search, {
        token: "guest",
        eventId,
        term: "failure",
      }),
    ).toMatchObject({ error: "SEARCH_UNAVAILABLE" });
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes("api.spotify.com"),
      ),
    ).toHaveLength(3);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("uses the shared song cache for different search terms, expands below five, and excludes archived songs", async () => {
  const { t, admin, eventId } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 5; i++)
      await ctx.db.insert("eventTracks", {
        eventId,
        trackId: `summer${i}`,
        title: `Summer ${i}`,
        artist: "Sunshine",
        searchText: `summer ${i} sunshine`,
        url: `https://open.spotify.com/track/summer${i}`,
        expiresAt: Date.now() + 86400000,
      });
  });
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("accounts.spotify.com"))
      return new Response(
        JSON.stringify({ access_token: "access", expires_in: 3600 }),
        { status: 200 },
      );
    return new Response(JSON.stringify({ tracks: { items: [] } }), {
      status: 200,
    });
  });
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test");
  vi.stubGlobal("fetch", fetcher);
  try {
    const first = await t.action(anyApi.services.search, {
      token: "guest",
      eventId,
      term: "summer",
    });
    const second = await t.action(anyApi.services.search, {
      token: "other",
      eventId,
      term: "sunshine",
    });
    expect(first.tracks).toHaveLength(5);
    expect(second.tracks).toHaveLength(5);
    expect(fetcher).not.toHaveBeenCalled();
    await unlock(t, eventId);
    expect(
      await t.mutation(anyApi.guest.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "summer0",
      }),
    ).toBe("OK");
    const [request] = await t.query(anyApi.guest.leaderboard, {
      eventId,
      limit: 50,
    });
    const mixed = await t.action(anyApi.services.search, {
      token: "other",
      eventId,
      term: "summer",
    });
    expect(
      mixed.tracks.filter(
        (row: { trackId: string }) => row.trackId === "summer0",
      ),
    ).toHaveLength(1);
    expect(mixed.tracks[0].votes).toBe(1);
    await admin.mutation(anyApi.admin.archive, {
      eventId,
      requestId: request._id,
      undo: false,
    });
    const fewer = await t.action(anyApi.services.search, {
      token: "other",
      eventId,
      term: "summer",
    });
    expect(fewer.tracks).toHaveLength(4);
    expect(
      fewer.tracks.some(
        (row: { trackId: string }) => row.trackId === "summer0",
      ),
    ).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await t.action(anyApi.services.search, {
      token: "guest",
      eventId,
      term: "sunshine",
      force: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("expires event songs independently and deletes event cache after closing", async () => {
  const { t, admin, eventId } = await setup();
  await t.run(async (ctx) => {
    const old = await ctx.db
      .query("eventTracks")
      .withIndex("event_track", (q) =>
        q.eq("eventId", eventId).eq("trackId", "song0"),
      )
      .unique();
    await ctx.db.patch(old!._id, { expiresAt: Date.now() - 1 });
  });
  const rows = await t.query(anyApi.internal.cachedSongSearch, {
    eventId,
    term: "song",
  });
  expect(rows.some((row: { trackId: string }) => row.trackId === "song0")).toBe(
    false,
  );
  await unlock(t, eventId);
  expect(
    await t.mutation(anyApi.guest.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "song0",
    }),
  ).toBe("INVALID_TRACK");
  await admin.mutation(anyApi.admin.end, { eventId });
  await expect(
    t.query(anyApi.internal.cachedSongSearch, { eventId, term: "song" }),
  ).rejects.toThrow();
  await t.mutation(anyApi.cleanup.eventCache, { eventId });
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("eventTracks")
        .withIndex("event", (q) => q.eq("eventId", eventId))
        .collect(),
    ),
  ).toHaveLength(0);
});

it("caches provider tracks for the event and makes them searchable and requestable by another guest", async () => {
  const { t, eventId } = await setup();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test");
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("accounts.spotify.com"))
      return new Response(
        JSON.stringify({ access_token: "access", expires_in: 3600 }),
        { status: 200 },
      );
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `fresh${i}`,
      name: `Fresh ${i}`,
      artists: [{ name: "Sunshine" }],
      album: { images: [] },
      external_urls: { spotify: `https://open.spotify.com/track/fresh${i}` },
    }));
    return new Response(JSON.stringify({ tracks: { items } }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    expect(
      (
        await t.action(anyApi.services.search, {
          token: "guest",
          eventId,
          term: "fresh",
        })
      ).tracks,
    ).toHaveLength(5);
    const later = await t.action(anyApi.services.search, {
      token: "other",
      eventId,
      term: "sunshine",
    });
    expect(later.tracks).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await unlock(t, eventId, "other");
    expect(
      await t.mutation(anyApi.guest.requestOrVote, {
        token: "other",
        eventId,
        trackId: "fresh0",
      }),
    ).toBe("OK");
    const row = await t.run((ctx) =>
      ctx.db
        .query("eventTracks")
        .withIndex("event_track", (q) =>
          q.eq("eventId", eventId).eq("trackId", "fresh0"),
        )
        .unique(),
    );
    expect(row!.expiresAt - Date.now()).toBeGreaterThan(86300000);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("preserves local cache results when provider expansion fails", async () => {
  const { t, eventId } = await setup();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request) =>
      String(url).includes("accounts.spotify.com")
        ? new Response(
            JSON.stringify({ access_token: "access", expires_in: 3600 }),
            { status: 200 },
          )
        : new Response("failed", { status: 503 }),
    ),
  );
  try {
    const result = await t.action(anyApi.services.search, {
      token: "guest",
      eventId,
      term: "song 0",
    });
    expect(result.error).toBe("SEARCH_UNAVAILABLE");
    expect(
      result.tracks.some((row: { trackId: string }) => row.trackId === "song0"),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
