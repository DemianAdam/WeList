import type { SearchLease } from "../../contracts/music";
import type { Infer } from "convex/values";
import { internal } from "../../_generated/api";
import type { MutationCtx } from "../../_generated/server";
import { live } from "../../events/access";
import { rate } from "../../platform/rateLimits";
import type { searchLeaseArgs, releaseSearchLeaseArgs } from "./validators";
export async function searchLease(
  ctx: MutationCtx,
  { key, owner, eventId }: Infer<typeof searchLeaseArgs>,
): Promise<SearchLease> {
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
    await ctx.scheduler.runAfter(
      25000,
      internal.music.spotify.mutations.expireQuotaProbe,
      {
        owner,
      },
    );
  }
  const data = { key, owner, eventId, expiresAt: Date.now() + 25000 };
  if (lease) await ctx.db.replace(lease._id, data);
  else await ctx.db.insert("searchLeases", data);
  console.log("search_cache_miss");
  return { provider };
}

export async function releaseSearchLease(
  ctx: MutationCtx,
  { key, owner }: Infer<typeof releaseSearchLeaseArgs>,
) {
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
}
