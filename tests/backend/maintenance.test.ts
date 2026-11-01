import { expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { setup } from "../support/backend";
it("cleans up events only after thirty days", async () => {
  const { t, admin, eventId } = await setup();
  await admin.mutation(api.events.mutations.endEvent, { eventId });
  await t.mutation(internal.maintenance.mutations.run, {});
  expect(await t.run((ctx) => ctx.db.get(eventId))).not.toBeNull();
  await t.run((ctx) =>
    ctx.db.patch(eventId, { endedAt: Date.now() - 31 * 86400000 }),
  );
  await t.mutation(internal.maintenance.mutations.run, {});
  expect(await t.run((ctx) => ctx.db.get(eventId))).toBeNull();
});
