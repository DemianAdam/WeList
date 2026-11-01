import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { digest } from "../platform/hashing";
export async function session(
  ctx: QueryCtx,
  token: string,
  role: "admin" | "guest",
) {
  const s = await ctx.db
    .query("sessions")
    .withIndex("hash", (q) => q.eq("hash", digest(token)))
    .unique();
  if (!s || s.role !== role || s.expiresAt <= Date.now())
    throw new ConvexError({ code: "SESSION_EXPIRED" });
  return s;
}
