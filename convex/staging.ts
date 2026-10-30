import { internalMutation, query } from "./lib/server";
import { anyApi } from "convex/server";

// Load-test entry points are disabled unless explicitly enabled on an isolated deployment.
export const enabled = query({
  args: {},
  handler: () => process.env.WELIST_STAGING_LOAD_TEST === "true",
});

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.WELIST_STAGING_LOAD_TEST !== "true")
      throw Error("Staging load test is disabled");
    const venue = await ctx.db
      .query("venue")
      .withIndex("key", (q) => q.eq("key", "pilot"))
      .unique();
    if (venue?.current) {
      const old = await ctx.db.get(venue.current);
      if (old?.name !== "Synthetic staging load test")
        throw Error("Refusing to replace a non-test event");
      if (old.status === "live")
        await ctx.db.patch(old._id, { status: "ended", endedAt: Date.now() });
      await ctx.scheduler.runAfter(0, anyApi.cleanup.eventCache, {
        eventId: old._id,
      });
    }
    const eventId = await ctx.db.insert("events", {
      name: "Synthetic staging load test",
      profiles: ["load_test"],
      status: "live",
    });
    if (venue) await ctx.db.patch(venue._id, { current: eventId });
    else await ctx.db.insert("venue", { key: "pilot", current: eventId });
    for (let i = 0; i < 10; i++)
      await ctx.db.insert("eventTracks", {
        eventId,
        trackId: `staging-song-${i}`,
        title: `Synthetic song ${i}`,
        artist: "Load test",
        url: "https://example.invalid",
        searchText: `synthetic song ${i} load test`,
        expiresAt: Date.now() + 3600000,
      });
    return { eventId };
  },
});
