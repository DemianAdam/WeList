import { createBackend } from "../support/backend";
import { api, internal } from "../../convex/_generated/api";
import { expect, it, vi } from "vitest";
it("staging fixtures refuse disabled staging and refuse to replace real events", async () => {
  const t = createBackend();
  vi.stubEnv("WELIST_STAGING_LOAD_TEST", "false");
  try {
    expect(await t.query(api.operations.staging.enabled, {})).toBe(false);
    await expect(
      t.mutation(internal.operations.staging.seed, {}),
    ).rejects.toThrow("disabled");
    vi.stubEnv("WELIST_STAGING_LOAD_TEST", "true");
    const { eventId } = await t.mutation(internal.operations.staging.seed, {});
    expect(await t.query(api.events.queries.currentEvent, {})).toMatchObject({
      _id: eventId,
      name: "Synthetic staging load test",
    });
    await t.run((ctx) => ctx.db.patch(eventId, { name: "Real event" }));
    await expect(
      t.mutation(internal.operations.staging.seed, {}),
    ).rejects.toThrow("non-test");
    expect((await t.query(api.events.queries.currentEvent, {}))!._id).toBe(
      eventId,
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
