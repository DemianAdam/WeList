import { v, type Infer } from "convex/values";
export const trackFields = {
  trackId: v.string(),
  title: v.string(),
  artist: v.string(),
  artwork: v.optional(v.string()),
  url: v.string(),
};

export const trackValidator = v.object(trackFields);
export type TrackMetadata = Infer<typeof trackValidator>;
