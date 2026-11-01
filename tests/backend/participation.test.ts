import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { expectData } from "../support/results";
import { setup, unlock } from "../support/backend";
it("allows one required Instagram profile and unlocks after that visit", async () => {
  const { t, admin, eventId } = await setup();
  await admin.mutation(api.events.mutations.endEvent, { eventId });
  const oneProfileEvent = expectData(
    await admin.mutation(api.events.mutations.startEvent, {
      name: "One profile",
      profiles: ["one"],
    }),
  ).eventId;
  expect(
    await t.mutation(api.participation.mutations.updateGate, {
      token: "guest",
      eventId: oneProfileEvent,
      profile: 1,
      confirm: false,
    }),
  ).toEqual({ ok: false, error: { code: "INVALID_PROFILE" } });
  await t.mutation(api.participation.mutations.updateGate, {
    token: "guest",
    eventId: oneProfileEvent,
    profile: 0,
    confirm: false,
  });
  expect(
    await t.mutation(api.participation.mutations.updateGate, {
      token: "guest",
      eventId: oneProfileEvent,
      confirm: true,
    }),
  ).toEqual({ ok: true, data: null });
});

it("requires both visits and explicit confirmation", async () => {
  const { t, eventId } = await setup();
  expect(
    await t.mutation(api.requests.mutations.requestOrVote, {
      token: "guest",
      eventId,
      trackId: "song0",
    }),
  ).toEqual({ ok: false, error: { code: "GATE_REQUIRED" } });
  await t.mutation(api.participation.mutations.updateGate, {
    token: "guest",
    eventId,
    profile: 0,
    confirm: false,
  });
  expect(
    await t.mutation(api.participation.mutations.updateGate, {
      token: "guest",
      eventId,
      confirm: true,
    }),
  ).toEqual({ ok: false, error: { code: "GATE_REQUIRED" } });
  await unlock(t, eventId);
  expect(
    (
      await t.query(api.participation.queries.participation, {
        token: "guest",
        eventId,
      })
    ).unlocked,
  ).toBe(true);
});
