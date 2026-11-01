import { v } from "convex/values";
export const currentEventArgs = v.object({});
export const dashboardArgs = v.object({});
export const startEventArgs = v.object({
  name: v.string(),
  profiles: v.array(v.string()),
});
export const endEventArgs = v.object({ eventId: v.id("events") });
