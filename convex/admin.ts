import { v, ConvexError } from "convex/values";
import { query, mutation } from "./lib/server";
import { live } from "./lib/security";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "./lib/server";
import { anyApi } from "convex/server";

async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  const admin = await ctx.db
    .query("administrators")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  if (!userId || admin?.userId !== userId)
    throw new ConvexError("UNAUTHORIZED");
  return true;
}
export const providerStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const provider = await ctx.db
      .query("provider")
      .withIndex("key", (q) => q.eq("key", "spotify"))
      .unique();
    return provider?.quotaStatus ?? "ok";
  },
});
export const retryProvider = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const provider = await ctx.db
      .query("provider")
      .withIndex("key", (q) => q.eq("key", "spotify"))
      .unique();
    if (provider?.quotaStatus === "paused")
      await ctx.db.patch(provider._id, { quotaStatus: "armed" });
  },
});
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const venue = await ctx.db
      .query("venue")
      .withIndex("key", (q) => q.eq("key", "pilot"))
      .unique();
    if (!venue?.current) return null;
    const event = await ctx.db.get(venue.current);
    const requests = await ctx.db
      .query("requests")
      .withIndex("event", (q) => q.eq("eventId", venue.current!))
      .collect();
    const people = await ctx.db
      .query("participation")
      .withIndex("event", (q) => q.eq("eventId", venue.current!))
      .collect();
    return {
      event,
      requests,
      metrics: {
        participants: people.length,
        profileClicks: [0, 1].map(
          (i) => people.filter((p) => p.clicks.includes(i)).length,
        ),
        unlocked: people.filter((p) => p.unlocked).length,
        exhausted: people.filter((p) => p.used === 3).length,
        votes: people.reduce((n, p) => n + p.used, 0),
        requests: requests.length,
      },
    };
  },
});
export const start = mutation({
  args: {
    name: v.string(),
    profiles: v.array(v.string()),
  },
  handler: async (ctx, { name, profiles }) => {
    await requireAdmin(ctx);
    profiles = profiles.map((p) => p.replace(/^@/, "").toLowerCase());
    name = name.trim();
    if (
      !name ||
      name.length > 80 ||
      profiles.length < 1 ||
      profiles.length > 2 ||
      profiles[0] === profiles[1] ||
      profiles.some((p) => !/^[a-z0-9._]{1,30}$/.test(p))
    )
      throw new ConvexError("INVALID_EVENT");
    const venue = await ctx.db
      .query("venue")
      .withIndex("key", (q) => q.eq("key", "pilot"))
      .unique();
    if (venue?.current && (await ctx.db.get(venue.current))?.status === "live")
      throw new ConvexError("EVENT_ALREADY_LIVE");
    const id = await ctx.db.insert("events", {
      name,
      profiles,
      status: "live",
    });
    if (venue) await ctx.db.patch(venue._id, { current: id });
    else await ctx.db.insert("venue", { key: "pilot", current: id });
    return id;
  },
});
export const end = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx);
    await live(ctx, eventId);
    await ctx.db.patch(eventId, { status: "ended", endedAt: Date.now() });
    await ctx.scheduler.runAfter(0, anyApi.cleanup.eventCache, { eventId });
  },
});
export const archive = mutation({
  args: {
    eventId: v.id("events"),
    requestId: v.id("requests"),
    undo: v.boolean(),
  },
  handler: async (ctx, { eventId, requestId, undo }) => {
    await requireAdmin(ctx);
    await live(ctx, eventId);
    const request = await ctx.db.get(requestId);
    if (!request || request.eventId !== eventId)
      throw new ConvexError("INVALID_REQUEST");
    if (undo) {
      if (
        !request.archived ||
        !request.removedAt ||
        Date.now() - request.removedAt > 10000
      )
        throw new ConvexError("UNDO_EXPIRED");
      await ctx.db.patch(requestId, { archived: false, removedAt: undefined });
    } else if (!request.archived)
      await ctx.db.patch(requestId, { archived: true, removedAt: Date.now() });
  },
});
