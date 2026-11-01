import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { expectData } from "../support/results";
import { setup, unlock } from "../support/backend";
it("returns a typed lifecycle rejection and structured validation errors", async () => {
  const { admin, eventId } = await setup();
  expect(
    await admin.mutation(api.events.mutations.startEvent, {
      name: "Another",
      profiles: ["one"],
    }),
  ).toEqual({ ok: false, error: { code: "EVENT_ALREADY_LIVE" } });
  expect(
    await admin.mutation(api.events.mutations.endEvent, { eventId }),
  ).toEqual({ ok: true, data: null });
  await expect(
    admin.mutation(api.events.mutations.startEvent, {
      name: "",
      profiles: ["one"],
    }),
  ).rejects.toMatchObject({ data: { code: "INVALID_EVENT" } });
});
it("denies every unauthenticated DJ write", async () => {
  const { t, eventId } = await setup();
  await unlock(t, eventId);
  await t.mutation(api.requests.mutations.requestOrVote, {
    token: "guest",
    eventId,
    trackId: "song0",
  });
  const [row] = await t.query(api.requests.queries.leaderboard, {
    eventId,
    limit: 50,
  });
  await expect(
    t.mutation(api.events.mutations.startEvent, {
      name: "Attack",
      profiles: ["attacker"],
    }),
  ).rejects.toThrow("UNAUTHORIZED");
  await expect(
    t.mutation(api.requests.mutations.setArchived, {
      eventId,
      requestId: row._id,
      undo: false,
    }),
  ).rejects.toThrow("UNAUTHORIZED");
  await expect(
    t.mutation(api.music.spotify.mutations.retryProvider, {}),
  ).rejects.toThrow("UNAUTHORIZED");
  expect((await t.query(api.events.queries.currentEvent, {}))!._id).toBe(
    eventId,
  );
});

it("closes old events and resets participation for a new event", async () => {
  const { t, admin, eventId } = await setup();
  await unlock(t, eventId);
  await admin.mutation(api.events.mutations.endEvent, { eventId });
  await expect(
    t.mutation(api.requests.mutations.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "song0",
    }),
  ).rejects.toThrow();
  const next = expectData(
    await admin.mutation(api.events.mutations.startEvent, {
      name: "Next",
      profiles: ["one", "two"],
    }),
  ).eventId;
  expect(
    await t.query(api.participation.queries.participation, {
      token: "guest",
      eventId: next,
    }),
  ).toMatchObject({ used: 0, unlocked: false });
});
