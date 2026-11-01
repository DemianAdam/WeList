import { v } from "convex/values";
export const providerStatusArgs = v.object({});
export const retryProviderArgs = v.object({});
export const expireQuotaProbeArgs = v.object({ owner: v.string() });
export const setQuotaArgs = v.object({
  owner: v.string(),
  exhausted: v.boolean(),
});
export const saveProviderArgs = v.object({
  token: v.optional(v.string()),
  expiresAt: v.number(),
  blockedUntil: v.number(),
});
