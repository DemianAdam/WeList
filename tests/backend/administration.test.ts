import { expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { setup, createBackend } from "../support/backend";
it("only permits the explicitly authorized identity, even if another user is authenticated", async () => {
  const { t, admin, eventId } = await setup();
  expect(await admin.query(api.events.queries.dashboard, {})).not.toBeNull();
  const otherId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "other@example.test" }),
  );
  await expect(
    t
      .withIdentity({ subject: otherId + "|session" })
      .query(api.events.queries.dashboard, {}),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.events.mutations.endEvent, { eventId }),
  ).rejects.toThrow();
  await t.mutation(internal.operations.provision.revoke, {});
  await expect(admin.query(api.events.queries.dashboard, {})).rejects.toThrow();
  await t.mutation(internal.operations.provision.authorize, {
    userId: otherId,
  });
  expect(
    await t
      .withIdentity({ subject: otherId + "|session" })
      .query(api.events.queries.dashboard, {}),
  ).not.toBeNull();
});

it("provisions and reprovisions the DJ account while public signup is disabled", async () => {
  const t = createBackend();
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: {
        flow: "signUp",
        email: "attacker@example.test",
        password: "long-password-123",
      },
    }),
  ).rejects.toThrow();
  await t.action(internal.operations.provision.setup, {
    password: "first-strong-password-123",
  });
  const account = await t.query(internal.operations.provision.account, {});
  const admins = await t.run((ctx) => ctx.db.query("administrators").collect());
  expect(admins[0].userId).toBe(account!.userId);
  await t.action(internal.operations.provision.setup, {
    password: "second-strong-password-456",
  });
  expect(
    (await t.query(internal.operations.provision.account, {}))!.userId,
  ).toBe(account!.userId);
});
