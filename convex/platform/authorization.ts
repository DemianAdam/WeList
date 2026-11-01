import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
export async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  const admin = await ctx.db
    .query("administrators")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  if (!userId || admin?.userId !== userId)
    throw new ConvexError({ code: "UNAUTHORIZED" });
  return true;
}
