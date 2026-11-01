import { internalMutation, internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import * as operations from "./stagingFixtures";
export const auditSessions = internalQuery({
  args: { hashes: v.array(v.string()) },
  handler: operations.auditSessions,
});
export const enabled = query({
  args: {},
  handler: () => process.env.WELIST_STAGING_LOAD_TEST === "true",
});
export const seed = internalMutation({ args: {}, handler: operations.seed });
