import type { Infer } from "convex/values";
import type { MutationCtx } from "../../_generated/server";
import { live } from "../../events/access";
import type { cacheSearchArgs } from "./validators";
export async function cacheSearch(
  ctx: MutationCtx,
  { key, owner, tracks, eventId }: Infer<typeof cacheSearchArgs>,
) {
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
}
