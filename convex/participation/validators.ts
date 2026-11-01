import { v } from "convex/values";
export const participationArgs = v.object({
  token: v.string(),
  eventId: v.id("events"),
});
export const updateGateArgs = v.object({
  token: v.string(),
  eventId: v.id("events"),
  profile: v.optional(v.number()),
  confirm: v.boolean(),
});
