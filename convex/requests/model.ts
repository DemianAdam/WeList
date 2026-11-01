import type { VoteResult, ArchiveResult } from "../contracts/commands";
import { ConvexError, type Infer } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { session } from "../sessions/access";
import { live } from "../events/access";
import { rate } from "../platform/rateLimits";
import { requireAdmin } from "../platform/authorization";
import { success, failure } from "../contracts/results";
import type {
  leaderboardArgs,
  requestOrVoteArgs,
  setArchivedArgs,
} from "./validators";
export async function leaderboard(
  ctx: QueryCtx,
  { eventId, limit }: Infer<typeof leaderboardArgs>,
) {
  const rows = await ctx.db
    .query("requests")
    .withIndex("ranking", (q) => q.eq("eventId", eventId).eq("archived", false))
    .order("desc")
    .take(1000);
  return rows
    .sort((a, b) => b.votes - a.votes || a._creationTime - b._creationTime)
    .slice(0, Math.min(1000, Math.max(50, limit)))
    .map(({ creator: _creator, ...r }) => r);
}

export async function requestOrVote(
  ctx: MutationCtx,
  { token, eventId, trackId }: Infer<typeof requestOrVoteArgs>,
): Promise<VoteResult> {
  const guest = await session(ctx, token, "guest");
  await live(ctx, eventId);
  if (!(await rate(ctx, "vote:" + guest._id, 10)))
    return failure("RATE_LIMITED");
  const p = await ctx.db
    .query("participation")
    .withIndex("event_guest", (q) =>
      q.eq("eventId", eventId).eq("guestId", guest._id),
    )
    .unique();
  if (!p?.unlocked) return failure("GATE_REQUIRED");
  const request = await ctx.db
    .query("requests")
    .withIndex("event_track", (q) =>
      q.eq("eventId", eventId).eq("trackId", trackId),
    )
    .unique();
  if (request) {
    const existing = await ctx.db
      .query("votes")
      .withIndex("unique", (q) =>
        q
          .eq("guestId", guest._id)
          .eq("eventId", eventId)
          .eq("requestId", request._id),
      )
      .unique();
    if (existing) return failure("DUPLICATE");
    if (request.archived) return failure("ARCHIVED");
  }
  if (p.used >= 3) return failure("EXHAUSTED");
  let requestId = request?._id;
  if (!request) {
    const track = await ctx.db
      .query("eventTracks")
      .withIndex("event_track", (q) =>
        q.eq("eventId", eventId).eq("trackId", trackId),
      )
      .unique();
    if (!track || track.expiresAt < Date.now()) return failure("INVALID_TRACK");
    const {
      _id,
      _creationTime,
      expiresAt: _expiresAt,
      eventId: _eventId,
      searchText: _searchText,
      ...metadata
    } = track;
    requestId = await ctx.db.insert("requests", {
      ...metadata,
      eventId,
      creator: guest._id,
      votes: 1,
      archived: false,
    });
  } else await ctx.db.patch(request._id, { votes: request.votes + 1 });
  await ctx.db.insert("votes", {
    eventId,
    guestId: guest._id,
    requestId: requestId!,
  });
  await ctx.db.patch(p._id, { used: p.used + 1 });
  return success(null);
}

export async function setArchived(
  ctx: MutationCtx,
  { eventId, requestId, undo }: Infer<typeof setArchivedArgs>,
): Promise<ArchiveResult> {
  await requireAdmin(ctx);
  await live(ctx, eventId);
  const request = await ctx.db.get(requestId);
  if (!request || request.eventId !== eventId)
    throw new ConvexError({ code: "INVALID_REQUEST" });
  if (undo) {
    if (
      !request.archived ||
      !request.removedAt ||
      Date.now() - request.removedAt > 10000
    )
      return failure("UNDO_EXPIRED");
    await ctx.db.patch(requestId, { archived: false, removedAt: undefined });
  } else if (!request.archived)
    await ctx.db.patch(requestId, { archived: true, removedAt: Date.now() });

  return success(null);
}
