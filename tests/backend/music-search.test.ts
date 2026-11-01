import { expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { expectData } from "../support/results";
import { setup, unlock } from "../support/backend";
it("pauses exhausted Spotify quota until an authorized DJ allows one probe", async () => {
  const { t, admin, eventId } = await setup();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test");
  let exhausted = true;
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("accounts.spotify.com"))
      return new Response(
        JSON.stringify({ access_token: "access", expires_in: 3600 }),
        { status: 200 },
      );
    await new Promise((resolve) => setTimeout(resolve, 60));
    return exhausted
      ? new Response(JSON.stringify({ error: { reason: "QUOTA_EXCEEDED" } }), {
          status: 429,
        })
      : new Response(JSON.stringify({ tracks: { items: [] } }), {
          status: 200,
        });
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    expect(
      expectData(
        await t.action(api.music.search.actions.search, {
          token: "guest",
          eventId,
          term: "absent",
        }),
      ),
    ).toMatchObject({ warning: { code: "QUOTA_EXCEEDED" } });
    expect(
      await admin.query(api.music.spotify.queries.providerStatus, {}),
    ).toBe("paused");
    await expect(
      t.mutation(api.music.spotify.mutations.retryProvider, {}),
    ).rejects.toThrow();
    const calls = fetcher.mock.calls.length;
    expect(
      expectData(
        await t.action(api.music.search.actions.search, {
          token: "other",
          eventId,
          term: "another",
        }),
      ),
    ).toMatchObject({ warning: { code: "QUOTA_EXCEEDED" } });
    expect(fetcher).toHaveBeenCalledTimes(calls);
    await admin.mutation(api.music.spotify.mutations.retryProvider, {});
    expect(
      await admin.query(api.music.spotify.queries.providerStatus, {}),
    ).toBe("armed");
    expect(
      expectData(
        await t.action(api.music.search.actions.search, {
          token: "guest",
          eventId,
          term: "retry-exhausted",
        }),
      ),
    ).toMatchObject({ warning: { code: "QUOTA_EXCEEDED" } });
    expect(
      await admin.query(api.music.spotify.queries.providerStatus, {}),
    ).toBe("paused");
    await admin.mutation(api.music.spotify.mutations.retryProvider, {});
    exhausted = false;
    const results = await Promise.all(
      ["other", "guest"].map((token, i) =>
        t.action(api.music.search.actions.search, {
          token,
          eventId,
          term: `newquery${i}`,
        }),
      ),
    );
    expect(
      results.filter((r) => r.ok && r.data.source === "spotify"),
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(calls + 2);
    expect(
      await admin.query(api.music.spotify.queries.providerStatus, {}),
    ).toBe("ok");
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("handles ordinary Spotify rate limiting with Retry-After without marking quota exhausted", async () => {
  const { t, admin, eventId } = await setup();
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
        : new Response("not json", {
            status: 429,
            headers: { "Retry-After": "42" },
          }),
    ),
  );
  try {
    expect(
      expectData(
        await t.action(api.music.search.actions.search, {
          token: "guest",
          eventId,
          term: "none",
        }),
      ),
    ).toMatchObject({ warning: { code: "SEARCH_UNAVAILABLE" } });
    expect(
      await admin.query(api.music.spotify.queries.providerStatus, {}),
    ).toBe("ok");
    const provider = await t.run((ctx) =>
      ctx.db
        .query("provider")
        .withIndex("key", (q) => q.eq("key", "spotify"))
        .unique(),
    );
    expect(provider!.blockedUntil - Date.now()).toBeGreaterThan(40000);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("local leaderboard searches do not consume Spotify quota", async () => {
  const { t, eventId } = await setup();
  await unlock(t, eventId);
  await t.mutation(api.requests.mutations.requestOrVote, {
    token: "guest",
    eventId,
    trackId: "song0",
  });
  for (let i = 0; i < 35; i++)
    expect(
      await t.query(internal.music.search.queries.localSearch, {
        eventId,
        term: "song",
      }),
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
      await t.mutation(internal.music.search.mutations.searchPermit, {
        token: "guest",
        eventId,
      }),
    ).not.toHaveProperty("error");
  expect(
    await t.mutation(internal.music.search.mutations.searchPermit, {
      token: "guest",
      eventId,
    }),
  ).toEqual({ error: "RATE_LIMITED" });
  await t.mutation(internal.music.spotify.mutations.saveProvider, {
    expiresAt: 0,
    blockedUntil: Date.now() + 60000,
  });
  expect(
    await t.mutation(internal.music.search.mutations.searchLease, {
      key: "absent",
      owner: "one",
    }),
  ).toEqual({ error: "SEARCH_UNAVAILABLE" });
});

it("validates and rate-limits the local search stage independently", async () => {
  const { t, admin, eventId } = await setup();
  await expect(
    t.action(api.music.search.actions.localSearch, {
      token: "invalid",
      eventId,
      term: "song",
    }),
  ).rejects.toThrow();
  for (let i = 0; i < 30; i++)
    expect(
      expectData(
        await t.action(api.music.search.actions.localSearch, {
          token: "guest",
          eventId,
          term: "song",
        }),
      ),
    ).toHaveProperty("tracks");
  expect(
    await t.action(api.music.search.actions.localSearch, {
      token: "guest",
      eventId,
      term: "song",
    }),
  ).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  await admin.mutation(api.events.mutations.endEvent, { eventId });
  await expect(
    t.action(api.music.search.actions.localSearch, {
      token: "other",
      eventId,
      term: "song",
    }),
  ).rejects.toThrow();
});

it("coalesces cache misses, caches empty responses, and protects against stale lease owners", async () => {
  const { t } = await setup();
  const key = "one song";
  const first = await t.mutation(internal.music.search.mutations.searchLease, {
    key,
    owner: "first",
  });
  expect(first).not.toHaveProperty("waiting");
  expect(
    await t.mutation(internal.music.search.mutations.searchLease, {
      key,
      owner: "second",
    }),
  ).toEqual({ waiting: true });
  expect(
    await t.mutation(internal.music.search.mutations.cacheSearch, {
      key,
      owner: "second",
      tracks: [],
    }),
  ).toBe(false);
  expect(
    await t.mutation(internal.music.search.mutations.cacheSearch, {
      key,
      owner: "first",
      tracks: [],
    }),
  ).toBe(true);
  expect(
    await t.mutation(internal.music.search.mutations.searchLease, {
      key,
      owner: "second",
    }),
  ).toEqual({ tracks: [] });
  await t.run(async (ctx) => {
    const cache = await ctx.db
      .query("cache")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
    await ctx.db.patch(cache!._id, { expiresAt: 0 });
  });
  expect(
    await t.mutation(internal.music.search.mutations.searchLease, {
      key,
      owner: "second",
    }),
  ).not.toHaveProperty("tracks");
  await t.mutation(internal.music.search.mutations.releaseSearchLease, {
    key,
    owner: "second",
  });
  expect(
    await t.mutation(internal.music.search.mutations.searchLease, {
      key,
      owner: "third",
    }),
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
    const a = expectData(
      await t.action(api.music.search.actions.search, {
        token: "guest",
        eventId,
        term: "  Daft   PUNK ",
      }),
    );
    const b = expectData(
      await t.action(api.music.search.actions.search, {
        token: "other",
        eventId,
        term: "daft punk",
      }),
    );
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
        t.action(api.music.search.actions.search, {
          token,
          eventId,
          term: "shared search",
        }),
      ),
    );
    expect(
      results.every((result) => result.ok && Array.isArray(result.data.tracks)),
    ).toBe(true);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes("api.spotify.com"),
      ),
    ).toHaveLength(1);
    fail = true;
    expect(
      expectData(
        await t.action(api.music.search.actions.search, {
          token: "guest",
          eventId,
          term: "failure",
        }),
      ),
    ).toMatchObject({ warning: { code: "SEARCH_UNAVAILABLE" } });
    expect(
      expectData(
        await t.action(api.music.search.actions.search, {
          token: "guest",
          eventId,
          term: "failure",
        }),
      ),
    ).toMatchObject({ warning: { code: "SEARCH_UNAVAILABLE" } });
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
    const first = expectData(
      await t.action(api.music.search.actions.search, {
        token: "guest",
        eventId,
        term: "summer",
      }),
    );
    const second = expectData(
      await t.action(api.music.search.actions.search, {
        token: "other",
        eventId,
        term: "sunshine",
      }),
    );
    expect(first.tracks).toHaveLength(5);
    expect(second.tracks).toHaveLength(5);
    expect(fetcher).not.toHaveBeenCalled();
    await unlock(t, eventId);
    expect(
      await t.mutation(api.requests.mutations.requestOrVote, {
        token: "guest",
        eventId,
        trackId: "summer0",
      }),
    ).toEqual({ ok: true, data: null });
    const [request] = await t.query(api.requests.queries.leaderboard, {
      eventId,
      limit: 50,
    });
    const mixed = expectData(
      await t.action(api.music.search.actions.search, {
        token: "other",
        eventId,
        term: "summer",
      }),
    );
    expect(
      mixed.tracks.filter(
        (row: { trackId: string }) => row.trackId === "summer0",
      ),
    ).toHaveLength(1);
    expect(mixed.tracks[0].votes).toBe(1);
    await admin.mutation(api.requests.mutations.setArchived, {
      eventId,
      requestId: request._id,
      undo: false,
    });
    const fewer = expectData(
      await t.action(api.music.search.actions.search, {
        token: "other",
        eventId,
        term: "summer",
      }),
    );
    expect(fewer.tracks).toHaveLength(4);
    expect(
      fewer.tracks.some(
        (row: { trackId: string }) => row.trackId === "summer0",
      ),
    ).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await t.action(api.music.search.actions.search, {
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
  const rows = await t.query(internal.music.search.queries.cachedSongSearch, {
    eventId,
    term: "song",
  });
  expect(rows.some((row: { trackId: string }) => row.trackId === "song0")).toBe(
    false,
  );
  await unlock(t, eventId);
  expect(
    await t.mutation(api.requests.mutations.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "song0",
    }),
  ).toEqual({ ok: false, error: { code: "INVALID_TRACK" } });
  await admin.mutation(api.events.mutations.endEvent, { eventId });
  await expect(
    t.query(internal.music.search.queries.cachedSongSearch, {
      eventId,
      term: "song",
    }),
  ).rejects.toThrow();
  await t.mutation(internal.maintenance.mutations.eventCache, { eventId });
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
      expectData(
        await t.action(api.music.search.actions.search, {
          token: "guest",
          eventId,
          term: "fresh",
        }),
      ).tracks,
    ).toHaveLength(5);
    const later = expectData(
      await t.action(api.music.search.actions.search, {
        token: "other",
        eventId,
        term: "sunshine",
      }),
    );
    expect(later.tracks).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await unlock(t, eventId, "other");
    expect(
      await t.mutation(api.requests.mutations.requestOrVote, {
        token: "other",
        eventId,
        trackId: "fresh0",
      }),
    ).toEqual({ ok: true, data: null });
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
    const result = expectData(
      await t.action(api.music.search.actions.search, {
        token: "guest",
        eventId,
        term: "song 0",
      }),
    );
    expect(result.warning?.code).toBe("SEARCH_UNAVAILABLE");
    expect(
      result.tracks.some((row: { trackId: string }) => row.trackId === "song0"),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("retains local songs after a provider timeout and permits a later search retry", async () => {
  const { t, eventId } = await setup();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test");
  let timedOut = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("accounts.spotify.com"))
        return new Response(
          JSON.stringify({ access_token: "access", expires_in: 3600 }),
        );
      if (timedOut) throw new DOMException("Request timed out", "TimeoutError");
      return new Response(JSON.stringify({ tracks: { items: [] } }));
    }),
  );
  try {
    const first = expectData(
      await t.action(api.music.search.actions.search, {
        token: "guest",
        eventId,
        term: "song 0",
      }),
    );
    expect(first).toMatchObject({
      warning: { code: "SEARCH_UNAVAILABLE" },
      tracks: [{ trackId: "song0" }],
    });
    timedOut = false;
    const retry = expectData(
      await t.action(api.music.search.actions.search, {
        token: "guest",
        eventId,
        term: "song 0",
      }),
    );
    expect(retry.warning?.code).toBeUndefined();
    expect(retry.tracks).toMatchObject([{ trackId: "song0" }]);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
