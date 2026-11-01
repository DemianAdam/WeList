import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { expect, it, vi } from "vitest";
import schema from "../convex/schema";
const modules = {
  ...import.meta.glob("../convex/**/*.ts"),
  "../convex/_generated/test-root.ts": async () => ({}),
};

it("staging fixtures refuse disabled staging and refuse to replace real events", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("WELIST_STAGING_LOAD_TEST", "false");
  try {
    expect(await t.query(anyApi.staging.enabled, {})).toBe(false);
    await expect(t.mutation(anyApi.staging.seed, {})).rejects.toThrow(
      "disabled",
    );
    vi.stubEnv("WELIST_STAGING_LOAD_TEST", "true");
    const { eventId } = await t.mutation(anyApi.staging.seed, {});
    expect(await t.query(anyApi.guest.current, {})).toMatchObject({
      _id: eventId,
      name: "Synthetic staging load test",
    });
    await t.run((ctx) => ctx.db.patch(eventId, { name: "Real event" }));
    await expect(t.mutation(anyApi.staging.seed, {})).rejects.toThrow(
      "non-test",
    );
    expect((await t.query(anyApi.guest.current, {}))!._id).toBe(eventId);
  } finally {
    vi.unstubAllEnvs();
  }
});
