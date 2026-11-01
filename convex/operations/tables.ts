import { defineTable } from "convex/server";
import { v } from "convex/values";
export const tables = {
  administrators: defineTable({ key: v.string(), userId: v.id("users") }).index(
    "key",
    ["key"],
  ),
};
