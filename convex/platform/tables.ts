import { defineTable } from "convex/server";
import { v } from "convex/values";
export const tables = {
  limits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  })
    .index("key", ["key"])
    .index("resetAt", ["resetAt"]),
};
