import { v } from "convex/values";
import { internalMutation, internalQuery } from "./lib/server";
import { rate, session, live } from "./lib/security";
import { trackFields } from "./schema";
import { anyApi } from "convex/server";
export const createSession = internalMutation({
  args: {
    hash: v.string(),
    role: v.union(v.literal("guest"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sessions", {
      ...args,
      expiresAt:
        Date.now() + (args.role === "guest" ? 30 * 86400000 : 12 * 3600000),
    });
  },
});
export const boundaryLimit = internalMutation({
  args: { key: v.string(), admin: v.boolean() },
  handler: (ctx, args) => rate(ctx, "auth:" + args.key, args.admin ? 5 : 20),
});
export const searchPermit = internalMutation({
  args: { token: v.string(), eventId: v.id("events") },
  handler: async (ctx, { token, eventId }) => {
    const guest = await session(ctx, token, "guest");
    await live(ctx, eventId);
    if (!(await rate(ctx, "search:" + guest._id, 30)))
      return { error: "RATE_LIMITED" as const };
    return { ok: true };
  },
});

export const localSearchPermit = internalMutation({
  args: { token: v.string(), eventId: v.id("events") },
  handler: async (ctx, { token, eventId }) => {
    const guest = await session(ctx, token, "guest");
    await live(ctx, eventId);
    if (!(await rate(ctx, "local-search:" + guest._id, 30)))
      return { error: "RATE_LIMITED" as const };
    return { ok: true };
  },
});

export const searchLease = internalMutation({
  args: {
    key: v.string(),
    owner: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { key, owner, eventId }) => {
    if (eventId) await live(ctx, eventId);
    const cache = await ctx.db
      .query("cache")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
    if (cache && cache.expiresAt > Date.now()) {
      console.log("search_cache_hit");
      return { tracks: cache.tracks };
    }
    const lease = await ctx.db
      .query("searchLeases")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
    if (lease && lease.expiresAt > Date.now()) return { waiting: true };
    const provider = await ctx.db
      .query("provider")
      .withIndex("key", (q) => q.eq("key", "spotify"))
      .unique();
    if (provider?.quotaStatus === "paused")
      return { error: "QUOTA_EXCEEDED" as const };
    if (provider?.quotaStatus === "probing") {
      if ((provider.probeExpiresAt ?? 0) <= Date.now())
        await ctx.db.patch(provider._id, {
          quotaStatus: "paused",
          probeOwner: undefined,
          probeExpiresAt: undefined,
        });
      return { error: "QUOTA_EXCEEDED" as const };
    }
    if (provider && provider.blockedUntil > Date.now())
      return { error: "SEARCH_UNAVAILABLE" as const };
    if (
      !(await rate(
        ctx,
        "spotify-global",
        Number(process.env.SPOTIFY_REQUESTS_PER_MINUTE) || 120,
      ))
    )
      return { error: "RATE_LIMITED" as const };
    if (provider?.quotaStatus === "armed") {
      await ctx.db.patch(provider._id, {
        quotaStatus: "probing",
        probeOwner: owner,
        probeExpiresAt: Date.now() + 25000,
      });
      await ctx.scheduler.runAfter(25000, anyApi.internal.expireQuotaProbe, {
        owner,
      });
    }
    const data = { key, owner, eventId, expiresAt: Date.now() + 25000 };
    if (lease) await ctx.db.replace(lease._id, data);
    else await ctx.db.insert("searchLeases", data);
    console.log("search_cache_miss");
    return { provider };
  },
});

export const expireQuotaProbe = internalMutation({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) => {
    const provider = await ctx.db
      .query("provider")
      .withIndex("key", (q) => q.eq("key", "spotify"))
      .unique();
    if (
      provider?.quotaStatus === "probing" &&
      provider.probeOwner === owner &&
      (provider.probeExpiresAt ?? 0) <= Date.now()
    )
      await ctx.db.patch(provider._id, {
        quotaStatus: "paused",
        probeOwner: undefined,
        probeExpiresAt: undefined,
      });
  },
});

export const releaseSearchLease = internalMutation({
  args: { key: v.string(), owner: v.string() },
  handler: async (ctx, { key, owner }) => {
    const lease = await ctx.db
      .query("searchLeases")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
    if (lease?.owner === owner) await ctx.db.delete(lease._id);
    const provider = await ctx.db
      .query("provider")
      .withIndex("key", (q) => q.eq("key", "spotify"))
      .unique();
    if (provider?.quotaStatus === "probing" && provider.probeOwner === owner)
      await ctx.db.patch(provider._id, {
        quotaStatus: "paused",
        probeOwner: undefined,
        probeExpiresAt: undefined,
      });
  },
});

export const setQuota = internalMutation({
  args: { owner: v.string(), exhausted: v.boolean() },
  handler: async (ctx, { owner, exhausted }) => {
    const provider = await ctx.db
      .query("provider")
      .withIndex("key", (q) => q.eq("key", "spotify"))
      .unique();
    if (exhausted) {
      if (provider)
        await ctx.db.patch(provider._id, {
          quotaStatus: "paused",
          probeOwner: undefined,
          probeExpiresAt: undefined,
        });
      else
        await ctx.db.insert("provider", {
          key: "spotify",
          blockedUntil: 0,
          expiresAt: 0,
          quotaStatus: "paused",
        });
    } else if (
      provider?.quotaStatus === "probing" &&
      provider.probeOwner === owner
    ) {
      await ctx.db.patch(provider._id, {
        quotaStatus: undefined,
        probeOwner: undefined,
        probeExpiresAt: undefined,
      });
    }
  },
});
export const saveProvider = internalMutation({
  args: {
    token: v.optional(v.string()),
    expiresAt: v.number(),
    blockedUntil: v.number(),
  },
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("provider")
      .withIndex("key", (q) => q.eq("key", "spotify"))
      .unique();
    if (old)
      await ctx.db.patch(old._id, {
        ...args,
        blockedUntil: Math.max(old.blockedUntil, args.blockedUntil),
      });
    else await ctx.db.insert("provider", { key: "spotify", ...args });
  },
});
export const cacheSearch = internalMutation({
  args: {
    key: v.string(),
    owner: v.string(),
    eventId: v.optional(v.id("events")),
    tracks: v.array(v.object(trackFields)),
  },
  handler: async (ctx, { key, owner, tracks, eventId }) => {
    if (eventId) await live(ctx, eventId);
    const lease = await ctx.db
      .query("searchLeases")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
    if (!lease || lease.owner !== owner || lease.expiresAt <= Date.now())
      return false;
    const cached = await ctx.db
      .query("cache")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
    const data = { key, eventId, tracks, expiresAt: Date.now() + 60000 };
    if (cached) await ctx.db.replace(cached._id, data);
    else await ctx.db.insert("cache", data);
    for (const track of tracks) {
      if (eventId) {
        const old = await ctx.db
          .query("eventTracks")
          .withIndex("event_track", (q) =>
            q.eq("eventId", eventId).eq("trackId", track.trackId),
          )
          .unique();
        const data = {
          ...track,
          eventId,
          searchText: (track.title + " " + track.artist)
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase(),
          expiresAt: Date.now() + 86400000,
        };
        if (old) await ctx.db.replace(old._id, data);
        else await ctx.db.insert("eventTracks", data);
        continue;
      }
      const old = await ctx.db
        .query("tracks")
        .withIndex("trackId", (q) => q.eq("trackId", track.trackId))
        .unique();
      const data = { ...track, expiresAt: Date.now() + 3600000 };
      if (old) await ctx.db.replace(old._id, data);
      else await ctx.db.insert("tracks", data);
    }
    await ctx.db.delete(lease._id);
    return true;
  },
});

export const cachedSongSearch = internalQuery({
  args: { eventId: v.id("events"), term: v.string() },
  handler: async (ctx, { eventId, term }) => {
    await live(ctx, eventId);
    const rows = await ctx.db
      .query("eventTracks")
      .withSearchIndex("search", (q) =>
        q.search("searchText", term).eq("eventId", eventId),
      )
      .take(100);
    const terms = term.split(/\s+/).filter(Boolean);
    const valid = rows.filter(
      (row) =>
        row.expiresAt > Date.now() &&
        terms.every((part) =>
          row.searchText.split(/\s+/).some((word) => word.startsWith(part)),
        ),
    );
    const requests = await Promise.all(
      valid.map((row) =>
        ctx.db
          .query("requests")
          .withIndex("event_track", (q) =>
            q.eq("eventId", eventId).eq("trackId", row.trackId),
          )
          .unique(),
      ),
    );
    return valid.flatMap((row, i) =>
      requests[i]?.archived
        ? []
        : [
            {
              trackId: row.trackId,
              title: row.title,
              artist: row.artist,
              artwork: row.artwork,
              url: row.url,
              votes: requests[i]?.votes ?? 0,
              _id: requests[i]?._id,
            },
          ],
    );
  },
});

export const visibleProviderTracks = internalQuery({
  args: { eventId: v.id("events"), tracks: v.array(v.object(trackFields)) },
  handler: async (ctx, { eventId, tracks }) => {
    await live(ctx, eventId);
    const requests = await Promise.all(
      tracks.map((track) =>
        ctx.db
          .query("requests")
          .withIndex("event_track", (q) =>
            q.eq("eventId", eventId).eq("trackId", track.trackId),
          )
          .unique(),
      ),
    );
    return tracks.flatMap((track, i) =>
      requests[i]?.archived
        ? []
        : [{ ...track, votes: requests[i]?.votes ?? 0, _id: requests[i]?._id }],
    );
  },
});
export const localSearch = internalQuery({
  args: { eventId: v.id("events"), term: v.string() },
  handler: async (ctx, { eventId, term }) => {
    await live(ctx, eventId);
    const rows = await ctx.db
      .query("requests")
      .withIndex("event", (q) => q.eq("eventId", eventId))
      .collect();
    return rows
      .filter(
        (t) =>
          !t.archived &&
          (t.title + " " + t.artist).toLocaleLowerCase().includes(term),
      )
      .slice(0, 10)
      .map(({ _id, trackId, title, artist, artwork, url, votes }) => ({
        _id,
        votes,
        trackId,
        title,
        artist,
        artwork,
        url,
      }));
  },
});
