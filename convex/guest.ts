import { v } from "convex/values";
import { query, mutation } from "./lib/server";
import { digest, session, live, rate } from "./lib/security";

export const issueSession = mutation({
  args: {},
  handler: async (ctx) => {
    const token =
      crypto.randomUUID().replaceAll("-", "") +
      crypto.randomUUID().replaceAll("-", "");
    const configured = Number(process.env.GUEST_SESSIONS_PER_MINUTE);
    const ceiling =
      Number.isSafeInteger(configured) && configured > 0 ? configured : 1000;
    if (!(await rate(ctx, "guest-session", ceiling))) return "RATE_LIMITED";
    await ctx.db.insert("sessions", {
      hash: digest(token),
      role: "guest",
      expiresAt: Date.now() + 30 * 86400000,
    });
    return token;
  },
});
export const current = query({
  args: {},
  handler: async (ctx) => {
    const venue = await ctx.db
      .query("venue")
      .withIndex("key", (q) => q.eq("key", "pilot"))
      .unique();
    return venue?.current ? await ctx.db.get(venue.current) : null;
  },
});
export const leaderboard = query({
  args: { eventId: v.id("events"), limit: v.number() },
  handler: async (ctx, { eventId, limit }) => {
    const rows = await ctx.db
      .query("requests")
      .withIndex("ranking", (q) =>
        q.eq("eventId", eventId).eq("archived", false),
      )
      .order("desc")
      .take(1000);
    return rows
      .sort((a, b) => b.votes - a.votes || a._creationTime - b._creationTime)
      .slice(0, Math.min(1000, Math.max(50, limit)))
      .map(({ creator: _creator, ...r }) => r);
  },
});
export const participation = query({
  args: { token: v.string(), eventId: v.id("events") },
  handler: async (ctx, { token, eventId }) => {
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
    };
  },
});
export const gate = mutation({
  args: {
    token: v.string(),
    eventId: v.id("events"),
    profile: v.optional(v.number()),
    confirm: v.boolean(),
  },
  handler: async (ctx, { token, eventId, profile, confirm }) => {
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
        return "GATE_REQUIRED";
      await ctx.db.patch(p._id, { unlocked: true });
      return "OK";
    }
    if (
      profile === undefined ||
      profile < 0 ||
      profile >= event.profiles.length
    )
      return "INVALID_PROFILE";
    if (!p.clicks.includes(profile))
      await ctx.db.patch(p._id, { clicks: [...p.clicks, profile] });
    return "OK";
  },
});
export const requestOrVote = mutation({
  args: { token: v.string(), eventId: v.id("events"), trackId: v.string() },
  handler: async (ctx, { token, eventId, trackId }) => {
    const guest = await session(ctx, token, "guest");
    await live(ctx, eventId);
    if (!(await rate(ctx, "vote:" + guest._id, 10))) return "RATE_LIMITED";
    const p = await ctx.db
      .query("participation")
      .withIndex("event_guest", (q) =>
        q.eq("eventId", eventId).eq("guestId", guest._id),
      )
      .unique();
    if (!p?.unlocked) return "GATE_REQUIRED";
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
      if (existing) return "DUPLICATE";
      if (request.archived) return "ARCHIVED";
    }
    if (p.used >= 3) return "EXHAUSTED";
    let requestId = request?._id;
    if (!request) {
      const track = await ctx.db
        .query("eventTracks")
        .withIndex("event_track", (q) =>
          q.eq("eventId", eventId).eq("trackId", trackId),
        )
        .unique();
      if (!track || track.expiresAt < Date.now()) return "INVALID_TRACK";
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
    return "OK";
  },
});
