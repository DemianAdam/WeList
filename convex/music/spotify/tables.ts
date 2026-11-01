import { defineTable } from "convex/server";
import { v } from "convex/values";
export const tables = {
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
};
