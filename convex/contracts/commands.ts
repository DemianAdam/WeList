import type { Id } from "../_generated/dataModel";
import type { Result } from "./results";

export type RegisterSessionResult = Result<{ reused: boolean }, "RATE_LIMITED">;
export type IssueSessionResult = Result<{ token: string }, "RATE_LIMITED">;
export type StartEventResult = Result<
  { eventId: Id<"events"> },
  "EVENT_ALREADY_LIVE"
>;
export type EmptyCommandResult = Result<null, never>;
export type GateResult = Result<null, "GATE_REQUIRED" | "INVALID_PROFILE">;
export type VoteResult = Result<
  null,
  | "RATE_LIMITED"
  | "GATE_REQUIRED"
  | "DUPLICATE"
  | "ARCHIVED"
  | "EXHAUSTED"
  | "INVALID_TRACK"
>;
export type ArchiveResult = Result<null, "UNDO_EXPIRED">;
