import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./server";
import type { GenericId } from "convex/values";
export const digest = (value: string) =>
  bytesToHex(sha256(new TextEncoder().encode(value)));
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
    throw new ConvexError("SESSION_EXPIRED");
  return s;
}
export async function live(ctx: QueryCtx, eventId: GenericId<"events">) {
  const venue = await ctx.db
    .query("venue")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  const event = await ctx.db.get(eventId);
  if (!event || event.status !== "live" || venue?.current !== eventId)
    throw new ConvexError("EVENT_CLOSED");
  return event;
}
export async function rate(
  ctx: MutationCtx,
  key: string,
  max: number,
  window = 60000,
) {
  const row = await ctx.db
    .query("limits")
    .withIndex("key", (q) => q.eq("key", key))
    .unique();
  const now = Date.now();
  if (!row) {
    await ctx.db.insert("limits", { key, count: 1, resetAt: now + window });
    return true;
  }
  if (row.resetAt <= now) {
    await ctx.db.patch(row._id, { count: 1, resetAt: now + window });
    return true;
  }
  if (row.count >= max) {
    console.warn("rate_limit", key.split(":")[0]);
    return false;
  }
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}
