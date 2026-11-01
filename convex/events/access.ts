import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
export async function live(ctx: QueryCtx, eventId: Id<"events">) {
  const venue = await ctx.db
    .query("venue")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  const event = await ctx.db.get(eventId);
  if (!event || event.status !== "live" || venue?.current !== eventId)
    throw new ConvexError({ code: "EVENT_CLOSED" });
  return event;
}
