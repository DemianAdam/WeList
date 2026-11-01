import type { Id, Doc } from "../_generated/dataModel";
import type { TrackMetadata } from "../music/validators";
import type { Result } from "./results";
export type SearchTrack = TrackMetadata & {
  _id?: Id<"requests">;
  votes?: number;
};
export type SearchCode =
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "SEARCH_UNAVAILABLE"
  | "SEARCH_NOT_CONFIGURED";
export type SearchSource = "local" | "cache" | "spotify";
export type SearchResult = Result<
  {
    tracks: SearchTrack[];
    source: SearchSource;
    warning?: { code: SearchCode };
  },
  "RATE_LIMITED"
>;

/** A lease and quota probe are acquired together in one transaction. */
export type SearchLease =
  | {
      tracks: TrackMetadata[];
      waiting?: never;
      error?: never;
      provider?: never;
    }
  | { waiting: true; tracks?: never; error?: never; provider?: never }
  | {
      error: Exclude<SearchCode, "SEARCH_NOT_CONFIGURED">;
      tracks?: never;
      waiting?: never;
      provider?: never;
    }
  | {
      provider: Doc<"provider"> | null;
      tracks?: never;
      waiting?: never;
      error?: never;
    };
