import { v } from "convex/values";
import { anyApi } from "convex/server";
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { internalAction, internalMutation, internalQuery } from "./lib/server";

const email = "admin@welist.local";

export const account = internalQuery({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique(),
});

export const authorize = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const old = await ctx.db
      .query("administrators")
      .withIndex("key", (q) => q.eq("key", "pilot"))
      .unique();
    if (old) await ctx.db.patch(old._id, { userId });
    else await ctx.db.insert("administrators", { key: "pilot", userId });
  },
});

export const revoke = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("administrators")
      .withIndex("key", (q) => q.eq("key", "pilot"))
      .unique();
    if (old) await ctx.db.delete(old._id);
  },
});

// Callable only with a deployment admin key, never from the public client.
export const setup = internalAction({
  args: { password: v.string() },
  handler: async (ctx, { password }): Promise<void> => {
    if (password.length < 16 || password.length > 256)
      throw new Error("Password must have 16–256 characters");
    const existing = await ctx.runQuery(anyApi.provision.account, {});
    await ctx.runMutation(anyApi.provision.revoke, {});
    let userId;
    if (existing) {
      userId = existing.userId;
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: password },
      });
      await invalidateSessions(ctx, { userId });
      await ctx.runMutation(anyApi.provision.authorize, { userId });
    } else {
      const created = await createAccount(ctx, {
        provider: "password",
        account: { id: email, secret: password },
        profile: { email },
      });
      userId = created.user._id;
      await ctx.runMutation(anyApi.provision.authorize, { userId });
    }
  },
});
