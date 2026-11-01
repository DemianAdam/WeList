import { defineTable } from "convex/server";
import { v } from "convex/values";
import { trackFields } from "../validators";
export const tables = {
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
};
