import { internal } from "../_generated/api";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
const email = "admin@welist.local";
export async function account(ctx: QueryCtx) {
  return ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "password").eq("providerAccountId", email),
    )
    .unique();
}
export async function authorize(
  ctx: MutationCtx,
  { userId }: { userId: Id<"users"> },
) {
  const old = await ctx.db
    .query("administrators")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  if (old) await ctx.db.patch(old._id, { userId });
  else await ctx.db.insert("administrators", { key: "pilot", userId });
}
export async function revoke(ctx: MutationCtx, _args: Record<string, never>) {
  const old = await ctx.db
    .query("administrators")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  if (old) await ctx.db.delete(old._id);
}
export async function setup(
  ctx: ActionCtx,
  { password }: { password: string },
): Promise<void> {
  if (password.length < 16 || password.length > 256)
    throw new Error("Password must have 16–256 characters");
  const existing = await ctx.runQuery(
    internal.operations.provision.account,
    {},
  );
  await ctx.runMutation(internal.operations.provision.revoke, {});
  let userId;
  if (existing) {
    userId = existing.userId;
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: password },
    });
    await invalidateSessions(ctx, { userId });
    await ctx.runMutation(internal.operations.provision.authorize, { userId });
  } else {
    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: password },
      profile: { email },
    });
    userId = created.user._id;
    await ctx.runMutation(internal.operations.provision.authorize, { userId });
  }
}
