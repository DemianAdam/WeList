import { defineTable } from "convex/server";
import { v } from "convex/values";
export const tables = {
  sessions: defineTable({
    hash: v.string(),
    role: v.union(v.literal("guest"), v.literal("admin")),
    expiresAt: v.number(),
  })
    .index("hash", ["hash"])
    .index("expiresAt", ["expiresAt"]),
};
