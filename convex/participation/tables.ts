import { defineTable } from "convex/server";
import { v } from "convex/values";
export const tables = {
  participation: defineTable({
    eventId: v.id("events"),
    guestId: v.id("sessions"),
    clicks: v.array(v.number()),
    unlocked: v.boolean(),
    used: v.number(),
  })
    .index("event_guest", ["eventId", "guestId"])
    .index("event", ["eventId"]),
};
