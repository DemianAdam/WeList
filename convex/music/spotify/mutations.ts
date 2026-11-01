import { mutation, internalMutation } from "../../_generated/server";
import {
  retryProviderArgs,
  expireQuotaProbeArgs,
  setQuotaArgs,
  saveProviderArgs,
} from "./validators";
import {
  retryProvider as retryProviderHandler,
  expireQuotaProbe as expireQuotaProbeHandler,
  setQuota as setQuotaHandler,
  saveProvider as saveProviderHandler,
} from "./model";
export const retryProvider = mutation({
  args: retryProviderArgs,
  handler: retryProviderHandler,
});

export const expireQuotaProbe = internalMutation({
  args: expireQuotaProbeArgs,
  handler: expireQuotaProbeHandler,
});

export const setQuota = internalMutation({
  args: setQuotaArgs,
  handler: setQuotaHandler,
});

export const saveProvider = internalMutation({
  args: saveProviderArgs,
  handler: saveProviderHandler,
});
