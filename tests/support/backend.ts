import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { digest } from "../../convex/platform/hashing";
import { expectData } from "./results";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";

const modules = import.meta.glob([
  "../../convex/**/*.{ts,js}",
  "!../../convex/**/*.d.ts",
  "!../../convex/convex.config.ts",
]);
export function createBackend() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
export async function setup() {
  const t = createBackend();
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "admin@welist.local",
    });
    await ctx.db.insert("administrators", { key: "pilot", userId });
    for (const token of ["guest", "other"])
      await ctx.db.insert("sessions", {
        hash: digest(token),
        role: "guest",
        expiresAt: Date.now() + 3600000,
      });
    return userId;
  });
  const admin = t.withIdentity({ subject: userId + "|session" });
  const eventId = expectData(
    await admin.mutation(api.events.mutations.startEvent, {
      name: "Test night",
      profiles: ["one", "two"],
    }),
  ).eventId;
  await t.run(async (ctx) => {
    for (let i = 0; i < 6; i++)
      await ctx.db.insert("eventTracks", {
        eventId,
        trackId: "song" + i,
        title: "Song " + i,
        artist: "Artist",
        searchText: "song " + i + " artist",
        url: "https://open.spotify.com/track/" + i,
        expiresAt: Date.now() + 3600000,
      });
  });
  return { t, admin, eventId };
}
export async function unlock(
  t: Awaited<ReturnType<typeof setup>>["t"],
  eventId: Id<"events">,
  token = "guest",
) {
  for (const profile of [0, 1])
    await t.mutation(api.participation.mutations.updateGate, {
      token,
      eventId,
      profile,
      confirm: false,
    });
  await t.mutation(api.participation.mutations.updateGate, {
    token,
    eventId,
    confirm: true,
  });
}
