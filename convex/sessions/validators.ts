import { v } from "convex/values";
export const registerSessionArgs = v.object({
  bootstrapToken: v.string(),
  operationId: v.string(),
});
export const issueSessionArgs = v.object({});
