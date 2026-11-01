import type {
  StartEventResult,
  EmptyCommandResult,
} from "../contracts/commands";
import { ConvexError, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { live } from "./access";
import { requireAdmin } from "../platform/authorization";
import { success, failure } from "../contracts/results";
import type {
  currentEventArgs,
  dashboardArgs,
  startEventArgs,
  endEventArgs,
} from "./validators";
export async function currentEvent(
  ctx: QueryCtx,
  _args: Infer<typeof currentEventArgs>,
) {
  const venue = await ctx.db
    .query("venue")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  return venue?.current ? await ctx.db.get(venue.current) : null;
}

export async function dashboard(
  ctx: QueryCtx,
  _args: Infer<typeof dashboardArgs>,
) {
  await requireAdmin(ctx);
  const venue = await ctx.db
    .query("venue")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  if (!venue?.current) return null;
  const event = await ctx.db.get(venue.current);
  const requests = await ctx.db
    .query("requests")
    .withIndex("event", (q) => q.eq("eventId", venue.current!))
    .collect();
  const people = await ctx.db
    .query("participation")
    .withIndex("event", (q) => q.eq("eventId", venue.current!))
    .collect();
  return {
    event,
    requests,
    metrics: {
      participants: people.length,
      profileClicks: [0, 1].map(
        (i) => people.filter((p) => p.clicks.includes(i)).length,
      ),
      unlocked: people.filter((p) => p.unlocked).length,
      exhausted: people.filter((p) => p.used === 3).length,
      votes: people.reduce((n, p) => n + p.used, 0),
      requests: requests.length,
    },
  };
}

export async function startEvent(
  ctx: MutationCtx,
  { name, profiles }: Infer<typeof startEventArgs>,
): Promise<StartEventResult> {
  await requireAdmin(ctx);
  profiles = profiles.map((p) => p.replace(/^@/, "").toLowerCase());
  name = name.trim();
  if (
    !name ||
    name.length > 80 ||
    profiles.length < 1 ||
    profiles.length > 2 ||
    profiles[0] === profiles[1] ||
    profiles.some((p) => !/^[a-z0-9._]{1,30}$/.test(p))
  )
    throw new ConvexError({ code: "INVALID_EVENT" });
  const venue = await ctx.db
    .query("venue")
    .withIndex("key", (q) => q.eq("key", "pilot"))
    .unique();
  if (venue?.current && (await ctx.db.get(venue.current))?.status === "live")
    return failure("EVENT_ALREADY_LIVE");
  const id = await ctx.db.insert("events", {
    name,
    profiles,
    status: "live",
  });
  if (venue) await ctx.db.patch(venue._id, { current: id });
  else await ctx.db.insert("venue", { key: "pilot", current: id });
  return success({ eventId: id });
}

export async function endEvent(
  ctx: MutationCtx,
  { eventId }: Infer<typeof endEventArgs>,
): Promise<EmptyCommandResult> {
  await requireAdmin(ctx);
  await live(ctx, eventId);
  await ctx.db.patch(eventId, { status: "ended", endedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.maintenance.mutations.eventCache, {
    eventId,
  });

  return success(null);
}
