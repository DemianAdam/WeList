import { v } from "convex/values";
import { trackFields } from "../validators";
export const searchPermitArgs = v.object({
  token: v.string(),
  eventId: v.id("events"),
});
export const localSearchPermitArgs = v.object({
  token: v.string(),
  eventId: v.id("events"),
});
export const searchLeaseArgs = v.object({
  key: v.string(),
  owner: v.string(),
  eventId: v.optional(v.id("events")),
});
export const releaseSearchLeaseArgs = v.object({
  key: v.string(),
  owner: v.string(),
});
export const cacheSearchArgs = v.object({
  key: v.string(),
  owner: v.string(),
  eventId: v.optional(v.id("events")),
  tracks: v.array(v.object(trackFields)),
});
export const cachedSongSearchArgs = v.object({
  eventId: v.id("events"),
  term: v.string(),
});
export const visibleProviderTracksArgs = v.object({
  eventId: v.id("events"),
  tracks: v.array(v.object(trackFields)),
});
export const localSearchArgs = v.object({
  eventId: v.id("events"),
  term: v.string(),
});
export const localActionArgs = v.object({
  token: v.string(),
  eventId: v.id("events"),
  term: v.string(),
});
export const searchArgs = v.object({
  token: v.string(),
  eventId: v.id("events"),
  term: v.string(),
  force: v.optional(v.boolean()),
});
