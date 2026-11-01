import { v } from "convex/values";
export const leaderboardArgs = v.object({
  eventId: v.id("events"),
  limit: v.number(),
});
export const requestOrVoteArgs = v.object({
  token: v.string(),
  eventId: v.id("events"),
  trackId: v.string(),
});
export const setArchivedArgs = v.object({
  eventId: v.id("events"),
  requestId: v.id("requests"),
  undo: v.boolean(),
});
