import { defineTable } from "convex/server";
import { v } from "convex/values";
export const tables = {
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
};
