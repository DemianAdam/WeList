import type { MutationCtx } from "../_generated/server";
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
