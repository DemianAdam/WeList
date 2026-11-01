import { defineTable } from "convex/server";
import { v } from "convex/values";
import { trackFields } from "../music/validators";
export const tables = {
  requests: defineTable({
    ...trackFields,
    eventId: v.id("events"),
    creator: v.id("sessions"),
    votes: v.number(),
    archived: v.boolean(),
    removedAt: v.optional(v.number()),
  })
    .index("event_track", ["eventId", "trackId"])
    .index("ranking", ["eventId", "archived", "votes"])
    .index("event", ["eventId"]),
  votes: defineTable({
    eventId: v.id("events"),
    guestId: v.id("sessions"),
    requestId: v.id("requests"),
  })
    .index("guest_event", ["guestId", "eventId"])
    .index("unique", ["guestId", "eventId", "requestId"])
    .index("event", ["eventId"]),
};
