import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
export const trackFields = {
  trackId: v.string(),
  title: v.string(),
  artist: v.string(),
  artwork: v.optional(v.string()),
  url: v.string(),
};
export default defineSchema({
  ...authTables,
  administrators: defineTable({ key: v.string(), userId: v.id("users") }).index(
    "key",
    ["key"],
  ),
  venue: defineTable({
    key: v.string(),
    current: v.optional(v.id("events")),
  }).index("key", ["key"]),
  events: defineTable({
    name: v.string(),
    profiles: v.array(v.string()),
    status: v.union(v.literal("live"), v.literal("ended")),
    endedAt: v.optional(v.number()),
  })
    .index("status", ["status"])
    .index("endedAt", ["endedAt"]),
  sessions: defineTable({
    hash: v.string(),
    role: v.union(v.literal("guest"), v.literal("admin")),
    expiresAt: v.number(),
  })
    .index("hash", ["hash"])
    .index("expiresAt", ["expiresAt"]),
  participation: defineTable({
    eventId: v.id("events"),
    guestId: v.id("sessions"),
    clicks: v.array(v.number()),
    unlocked: v.boolean(),
    used: v.number(),
  })
    .index("event_guest", ["eventId", "guestId"])
    .index("event", ["eventId"]),
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
  tracks: defineTable({ ...trackFields, expiresAt: v.number() })
    .index("trackId", ["trackId"])
    .index("expiresAt", ["expiresAt"]),
  eventTracks: defineTable({
    ...trackFields,
    eventId: v.id("events"),
    searchText: v.string(),
    expiresAt: v.number(),
  })
    .index("event_track", ["eventId", "trackId"])
    .index("event", ["eventId"])
    .index("expiresAt", ["expiresAt"])
    .searchIndex("search", {
      searchField: "searchText",
      filterFields: ["eventId"],
    }),
  cache: defineTable({
    key: v.string(),
    eventId: v.optional(v.id("events")),
    tracks: v.array(v.object(trackFields)),
    expiresAt: v.number(),
  })
    .index("key", ["key"])
    .index("event", ["eventId"])
    .index("expiresAt", ["expiresAt"]),
  searchLeases: defineTable({
    key: v.string(),
    eventId: v.optional(v.id("events")),
    owner: v.string(),
    expiresAt: v.number(),
  })
    .index("key", ["key"])
    .index("event", ["eventId"])
    .index("expiresAt", ["expiresAt"]),
  limits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  })
    .index("key", ["key"])
    .index("resetAt", ["resetAt"]),
  provider: defineTable({
    key: v.string(),
    token: v.optional(v.string()),
    expiresAt: v.number(),
    blockedUntil: v.number(),
    quotaStatus: v.optional(
      v.union(v.literal("paused"), v.literal("armed"), v.literal("probing")),
    ),
    probeOwner: v.optional(v.string()),
    probeExpiresAt: v.optional(v.number()),
  }).index("key", ["key"]),
});
