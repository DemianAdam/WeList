import type { Result } from "../../convex/contracts/results";
import type { FunctionReference } from "convex/server";
import { api, internal } from "../../convex/_generated/api";
import { test, expect } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
function expectData<T>(result: Result<T, string>): T {
  if (!result.ok) throw Error(result.error.code);
  return result.data;
}

const url = process.env.WELIST_STAGING_URL;
const key = process.env.WELIST_STAGING_DEPLOY_KEY;
test.beforeEach(async () => {
  if (!url || !key || process.env.WELIST_STAGING_ACK !== "true")
    throw Error(
      "BLOCKED: set explicit staging URL, deploy key and WELIST_STAGING_ACK=true",
    );
  const client = new ConvexHttpClient(url);
  if ((await client.query(api.operations.staging.enabled, {})) !== true)
    throw Error("Staging flag is disabled");
  const event = await client.query(api.events.queries.currentEvent, {});
  if (event?.name !== "Synthetic staging load test" || event.status !== "live")
    throw Error("Expected synthetic staging event");
  // The CLI-only admin method is present at runtime but omitted from public types.
  (
    client as ConvexHttpClient & { setAdminAuth: (key: string) => void }
  ).setAdminAuth(key);
  await client.mutation(
    internal.operations.staging
      .seed as unknown as FunctionReference<"mutation">,
    {},
  );
});

test("a delayed registration response recovers without duplicating the vote budget", async ({
  page,
}) => {
  let firstRegistration: number | undefined;
  let registrations = 0;
  let firstCredential: string | undefined;
  let sameCredential = true;
  let delayed = false;
  let delivered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await page.routeWebSocket(
    (socketUrl) => socketUrl.hostname === new URL(url!).hostname,
    (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => {
        const frame = JSON.parse(String(message));
        if (
          frame.type === "Mutation" &&
          frame.udfPath === api.sessions.mutations.registerSession
        ) {
          registrations++;
          const credential = frame.args?.[0]?.bootstrapToken;
          sameCredential &&=
            typeof credential === "string" && /^[a-f0-9]{64}$/.test(credential);
          firstCredential ??= credential;
          sameCredential &&= credential === firstCredential;
          firstRegistration ??= frame.requestId;
        }
        server.send(message);
      });
      server.onMessage((message) => {
        const frame = JSON.parse(String(message));
        if (
          !delayed &&
          frame.type === "MutationResponse" &&
          frame.requestId === firstRegistration &&
          frame.success
        ) {
          delayed = true;
          timer = setTimeout(() => {
            socket.send(message);
            delivered = true;
          }, 4000);
        } else socket.send(message);
      });
    },
  );
  try {
    await page.goto("/");
    await page.getByLabel("Buscar canción o artista").fill("synthetic");
    await expect(
      page.getByRole("button", { name: "Votar Synthetic song 0", exact: true }),
    ).toBeVisible();
    expect(delayed).toBe(true);
    expect(registrations).toBeGreaterThanOrEqual(2);
    expect(sameCredential).toBe(true);
    await page
      .getByRole("button", { name: "Votar Synthetic song 0", exact: true })
      .click();
    await page.getByRole("link", { name: /@load_test/ }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
    await expect.poll(() => delivered).toBe(true);
    await page.reload();
    await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
  } finally {
    clearTimeout(timer);
  }
});

test("same-browser tabs share registration and the permanent vote budget", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await Promise.all([page.goto("/"), other.goto("/")]);
  await Promise.all(
    [page, other].map((tab) =>
      tab.getByLabel("Buscar canción o artista").fill("synthetic"),
    ),
  );
  await expect(
    page.getByRole("button", { name: "Votar Synthetic song 0", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "Votar Synthetic song 0", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Votar Synthetic song 0", exact: true })
    .click();
  await page.getByRole("link", { name: /@load_test/ }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(other.getByText("Te quedan 2 de 3 votos")).toBeVisible();
  await other
    .getByRole("button", { name: "Votar Synthetic song 1", exact: true })
    .click();
  await expect(page.getByText("Te quedan 1 de 3 votos")).toBeVisible();
  await expect(other.getByText("Te quedan 1 de 3 votos")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Te quedan 1 de 3 votos")).toBeVisible();
});

test("independent guests share votes, reconnect and preserve their budgets", async ({
  browser,
  isMobile,
  hasTouch,
  viewport,
  userAgent,
  deviceScaleFactor,
}) => {
  const options = {
    isMobile,
    hasTouch,
    viewport,
    userAgent,
    deviceScaleFactor,
  };
  const first = await browser.newContext(options);
  const second = await browser.newContext(options);
  try {
    const a = await first.newPage(),
      b = await second.newPage();
    await a.goto("http://localhost:5181/");
    await b.goto("http://localhost:5181/");
    for (const page of [a, b]) {
      await page.getByLabel("Buscar canción o artista").fill("synthetic");
      await page
        .getByRole("button", { name: "Votar Synthetic song 0", exact: true })
        .click();
      await page.getByRole("link", { name: /@load_test/ }).click();
      await page
        .getByRole("button", { name: "Continuar", exact: true })
        .click();
      await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
    }
    const client = new ConvexHttpClient(url!);
    const event = await client.query(api.events.queries.currentEvent, {});
    await expect
      .poll(
        async () =>
          (
            await client.query(api.requests.queries.leaderboard, {
              eventId: event!._id,
              limit: 50,
            })
          )[0]?.votes,
      )
      .toBe(2);
    await second.setOffline(true);
    await a
      .getByRole("button", { name: "Votar Synthetic song 1", exact: true })
      .click();
    await expect(a.getByText("Te quedan 1 de 3 votos")).toBeVisible();
    await second.setOffline(false);
    await expect(
      b.getByRole("button", { name: "Votar Synthetic song 1", exact: true }),
    ).toContainText("1");
    await b.reload();
    await expect(b.getByText("Te quedan 2 de 3 votos")).toBeVisible();
    const rows = await client.query(api.requests.queries.leaderboard, {
      eventId: event!._id,
      limit: 50,
    });
    expect(
      rows.reduce((sum: number, r: { votes: number }) => sum + r.votes, 0),
    ).toBe(3);
  } finally {
    await first.close();
    await second.close();
  }
});

test("real DJ login, session restoration, moderation, logout and event lifecycle", async ({
  page,
}) => {
  test.skip(
    !process.env.WELIST_STAGING_DJ_PASSWORD,
    "BLOCKED: isolated staging DJ password unavailable",
  );
  const client = new ConvexHttpClient(url!);
  const event = await client.query(api.events.queries.currentEvent, {});
  const token = expectData(
    await client.mutation(api.sessions.mutations.issueSession, {}),
  ).token;
  for (const extra of [{ profile: 0, confirm: false }, { confirm: true }])
    expect(
      await client.mutation(api.participation.mutations.updateGate, {
        token,
        eventId: event!._id,
        ...extra,
      }),
    ).toMatchObject({ ok: true });
  expect(
    await client.mutation(api.requests.mutations.requestOrVote, {
      token,
      eventId: event!._id,
      trackId: "staging-song-0",
    }),
  ).toMatchObject({ ok: true });
  await page.goto("/dj-booth");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(process.env.WELIST_STAGING_DJ_PASSWORD!);
  await page.getByRole("button", { name: "Entrar a la cabina" }).click();
  await expect(
    page.getByRole("button", { name: "Salir", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Quitar Synthetic song 0" }).click();
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Quitar Synthetic song 0" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Terminar evento", exact: true })
    .click();
  await page.getByRole("button", { name: "Sí, terminar evento" }).click();
  // Preserve the synthetic name so the next guarded suite can reseed safely.
  await page
    .getByLabel("Nombre del evento")
    .fill("Synthetic staging load test");
  await page.getByLabel("Perfil de Instagram 1").fill("load_test");
  await page.getByRole("button", { name: "Revisar evento" }).click();
  await page.getByRole("button", { name: "Iniciar evento" }).click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar a la cabina" }),
  ).toBeVisible();
});
