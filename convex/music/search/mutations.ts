import { internalMutation } from "../../_generated/server";
import {
  searchPermitArgs,
  localSearchPermitArgs,
  searchLeaseArgs,
  releaseSearchLeaseArgs,
  cacheSearchArgs,
} from "./validators";
import {
  searchPermit as searchPermitHandler,
  localSearchPermit as localSearchPermitHandler,
} from "./admission";
import {
  searchLease as searchLeaseHandler,
  releaseSearchLease as releaseSearchLeaseHandler,
} from "./leases";
import { cacheSearch as cacheSearchHandler } from "./cache";
export const searchPermit = internalMutation({
  args: searchPermitArgs,
  handler: searchPermitHandler,
});

export const localSearchPermit = internalMutation({
  args: localSearchPermitArgs,
  handler: localSearchPermitHandler,
});

export const searchLease = internalMutation({
  args: searchLeaseArgs,
  handler: searchLeaseHandler,
});

export const releaseSearchLease = internalMutation({
  args: releaseSearchLeaseArgs,
  handler: releaseSearchLeaseHandler,
});

export const cacheSearch = internalMutation({
  args: cacheSearchArgs,
  handler: cacheSearchHandler,
});
