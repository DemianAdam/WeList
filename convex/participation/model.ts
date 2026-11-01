import type { GateResult } from "../contracts/commands";
import type { Infer } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { session } from "../sessions/access";
import { live } from "../events/access";
import { success, failure } from "../contracts/results";
import type { participationArgs, updateGateArgs } from "./validators";
export async function participation(
  ctx: QueryCtx,
  { token, eventId }: Infer<typeof participationArgs>,
) {
  const guest = await session(ctx, token, "guest");
  const p = await ctx.db
    .query("participation")
    .withIndex("event_guest", (q) =>
      q.eq("eventId", eventId).eq("guestId", guest._id),
    )
    .unique();
  const votes = await ctx.db
    .query("votes")
    .withIndex("guest_event", (q) =>
      q.eq("guestId", guest._id).eq("eventId", eventId),
    )
    .collect();
  const tracks = await Promise.all(votes.map((v) => ctx.db.get(v.requestId)));
  return {
    clicks: p?.clicks ?? [],
    unlocked: p?.unlocked ?? false,
    used: p?.used ?? 0,
    votes: tracks.flatMap((t) => (t ? [t.trackId] : [])),
    votedTracks: tracks.flatMap((t) =>
      t
        ? [
            {
              _id: t._id,
              trackId: t.trackId,
              title: t.title,
              artist: t.artist,
              votes: t.votes,
              archived: t.archived,
              removedAt: t.removedAt,
              artwork: t.artwork,
              url: t.url,
            },
          ]
        : [],
    ),
  };
}

export async function updateGate(
  ctx: MutationCtx,
  { token, eventId, profile, confirm }: Infer<typeof updateGateArgs>,
): Promise<GateResult> {
  const guest = await session(ctx, token, "guest");
  const event = await live(ctx, eventId);
  let p = await ctx.db
    .query("participation")
    .withIndex("event_guest", (q) =>
      q.eq("eventId", eventId).eq("guestId", guest._id),
    )
    .unique();
  if (!p) {
    const id = await ctx.db.insert("participation", {
      eventId,
      guestId: guest._id,
      clicks: [],
      unlocked: false,
      used: 0,
    });
    p = (await ctx.db.get(id))!;
  }
  if (confirm) {
    const requiredClicks = event.profiles.map((_, index) => index);
    if (
      p.clicks.length !== requiredClicks.length ||
      requiredClicks.some((index) => !p.clicks.includes(index))
    )
      return failure("GATE_REQUIRED");
    await ctx.db.patch(p._id, { unlocked: true });
    return success(null);
  }
  if (profile === undefined || profile < 0 || profile >= event.profiles.length)
    return failure("INVALID_PROFILE");
  if (!p.clicks.includes(profile))
    await ctx.db.patch(p._id, { clicks: [...p.clicks, profile] });
  return success(null);
}
