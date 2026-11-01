import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { eventCacheArgs, runArgs } from "./validators";
export async function eventCache(
  ctx: MutationCtx,
  { eventId }: Infer<typeof eventCacheArgs>,
) {
  const event = await ctx.db.get(eventId);
  if (event?.status === "live") return;
  let pending = false;
  for (const table of ["eventTracks", "cache", "searchLeases"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("event", (q) => q.eq("eventId", eventId))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100) pending = true;
  }
  if (pending)
    await ctx.scheduler.runAfter(0, internal.maintenance.mutations.eventCache, {
      eventId,
    });
}

export async function run(ctx: MutationCtx, _args: Infer<typeof runArgs>) {
  const events = await ctx.db
    .query("events")
    .withIndex("status", (q) => q.eq("status", "ended"))
    .take(100);
  for (const event of events.filter(
    (e) => (e.endedAt ?? Infinity) < Date.now() - 30 * 86400000,
  )) {
    let pending = false;
    for (const table of ["votes", "requests", "participation"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("event", (q) => q.eq("eventId", event._id))
        .take(100);
      for (const row of rows) await ctx.db.delete(row._id);
      if (rows.length === 100) pending = true;
    }
    if (!pending) {
      const venue = await ctx.db
        .query("venue")
        .withIndex("key", (q) => q.eq("key", "pilot"))
        .unique();
      if (venue?.current === event._id)
        await ctx.db.patch(venue._id, { current: undefined });
      await ctx.db.delete(event._id);
    }
  }
  for (const table of [
    "sessions",
    "tracks",
    "eventTracks",
    "cache",
    "searchLeases",
  ] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("limits")
    .withIndex("resetAt", (q) => q.lt("resetAt", Date.now()))
    .take(100))
    await ctx.db.delete(row._id);
}
