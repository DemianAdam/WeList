import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import * as operations from "./provisioning";
export const account = internalQuery({ args: {}, handler: operations.account });
export const authorize = internalMutation({
  args: { userId: v.id("users") },
  handler: operations.authorize,
});
export const revoke = internalMutation({
  args: {},
  handler: operations.revoke,
});
export const setup = internalAction({
  args: { password: v.string() },
  handler: operations.setup,
});
