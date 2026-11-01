import type { EmptyCommandResult } from "../../contracts/commands";
import type { Infer } from "convex/values";
import type { QueryCtx, MutationCtx } from "../../_generated/server";
import { requireAdmin } from "../../platform/authorization";
import { success } from "../../contracts/results";
import type {
  providerStatusArgs,
  retryProviderArgs,
  expireQuotaProbeArgs,
  setQuotaArgs,
  saveProviderArgs,
} from "./validators";
export async function providerStatus(
  ctx: QueryCtx,
  _args: Infer<typeof providerStatusArgs>,
) {
  await requireAdmin(ctx);
  const provider = await ctx.db
    .query("provider")
    .withIndex("key", (q) => q.eq("key", "spotify"))
    .unique();
  return provider?.quotaStatus ?? "ok";
}

export async function retryProvider(
  ctx: MutationCtx,
  _args: Infer<typeof retryProviderArgs>,
): Promise<EmptyCommandResult> {
  await requireAdmin(ctx);
  const provider = await ctx.db
    .query("provider")
    .withIndex("key", (q) => q.eq("key", "spotify"))
    .unique();
  if (provider?.quotaStatus === "paused")
    await ctx.db.patch(provider._id, { quotaStatus: "armed" });

  return success(null);
}

export async function expireQuotaProbe(
  ctx: MutationCtx,
  { owner }: Infer<typeof expireQuotaProbeArgs>,
) {
  const provider = await ctx.db
    .query("provider")
    .withIndex("key", (q) => q.eq("key", "spotify"))
    .unique();
  if (
    provider?.quotaStatus === "probing" &&
    provider.probeOwner === owner &&
    (provider.probeExpiresAt ?? 0) <= Date.now()
  )
    await ctx.db.patch(provider._id, {
      quotaStatus: "paused",
      probeOwner: undefined,
      probeExpiresAt: undefined,
    });
}

export async function setQuota(
  ctx: MutationCtx,
  { owner, exhausted }: Infer<typeof setQuotaArgs>,
) {
  const provider = await ctx.db
    .query("provider")
    .withIndex("key", (q) => q.eq("key", "spotify"))
    .unique();
  if (exhausted) {
    if (provider)
      await ctx.db.patch(provider._id, {
        quotaStatus: "paused",
        probeOwner: undefined,
        probeExpiresAt: undefined,
      });
    else
      await ctx.db.insert("provider", {
        key: "spotify",
        blockedUntil: 0,
        expiresAt: 0,
        quotaStatus: "paused",
      });
  } else if (
    provider?.quotaStatus === "probing" &&
    provider.probeOwner === owner
  ) {
    await ctx.db.patch(provider._id, {
      quotaStatus: undefined,
      probeOwner: undefined,
      probeExpiresAt: undefined,
    });
  }
}

export async function saveProvider(
  ctx: MutationCtx,
  args: Infer<typeof saveProviderArgs>,
) {
  const old = await ctx.db
    .query("provider")
    .withIndex("key", (q) => q.eq("key", "spotify"))
    .unique();
  if (old)
    await ctx.db.patch(old._id, {
      ...args,
      blockedUntil: Math.max(old.blockedUntil, args.blockedUntil),
    });
  else await ctx.db.insert("provider", { key: "spotify", ...args });
}
