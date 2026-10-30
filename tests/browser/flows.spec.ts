import { test, expect } from "@playwright/test";
test("one-profile event can retry a failed Instagram visit", async ({
  page,
}) => {
  await page.goto("/dj-booth");
  await page.getByLabel("Contraseña", { exact: true }).fill("welist-demo");
  await page.getByRole("button", { name: "Entrar a la cabina" }).click();
  await page
    .getByRole("button", { name: "Terminar evento", exact: true })
    .click();
  await page.getByRole("button", { name: "Sí, terminar evento" }).click();
  await page.getByLabel("Nombre del evento").fill("One profile");
  await page.getByLabel("Perfil de Instagram 1").fill("solo_dj");
  await page.getByRole("button", { name: "Revisar evento" }).click();
  await page.getByRole("button", { name: "Iniciar evento" }).click();
  await page.goto("/");
  await page.getByLabel("Buscar canción o artista").fill("Midnight");
  await page.getByRole("button", { name: "Votar Midnight City" }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, value) {
      if (fail && key === "welist-demo-v2" && value.includes('"clicks":[0]')) {
        fail = false;
        throw new Error("failed");
      }
      original.call(this, key, value);
    };
  });
  const dialog = page.getByRole("dialog", { name: "Conecta con la noche" });
  await dialog.getByRole("link", { name: "@solo_dj" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Vuelve a tocar @solo_dj",
  );
  await dialog.getByRole("link", { name: "@solo_dj" }).click();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
});
test("failed Instagram registration is visible inside the gate and can be retried", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, value) {
      if (fail && key === "welist-demo-v2" && value.includes('"clicks":[0]')) {
        fail = false;
        throw new Error("failed");
      }
      original.call(this, key, value);
    };
  });
  const dialog = page.getByRole("dialog", { name: "Conecta con la noche" });
  await dialog.getByRole("link", { name: "@welist.dj" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Vuelve a tocar @welist.dj",
  );
  await expect(
    dialog.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("link", { name: "@welist.dj" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("link", { name: "@welist.club" }).click();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
});
test("guests can see their votes, including a song removed and restored by the DJ", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Cabina DJ/ })).toHaveCount(0);
  await page.getByText("Ver tus votos", { exact: false }).click();
  const votes = page.getByRole("region", { name: "Tus votos" });
  await expect(votes).toContainText("Tus canciones elegidas aparecerán aquí.");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await page.getByRole("link", { name: "@welist.dj" }).click();
  await page.getByRole("link", { name: "@welist.club" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(votes).toContainText("Blinding Lights");
  await expect(votes).toContainText("The Weeknd");
  await page.getByRole("button", { name: "Votar Levitating" }).click();
  await expect(votes).toContainText("Levitating");
  await page.getByLabel("Buscar canción o artista").fill("unrelated search");
  await expect(votes).toContainText("Blinding Lights");
  await page.reload();
  await page.getByText("Ver tus votos", { exact: false }).click();
  await expect(votes).toContainText("Blinding Lights");
  await expect(votes).toContainText("Levitating");
  const booth = await context.newPage();
  await booth.goto("/dj-booth");
  await booth.getByLabel("Contraseña", { exact: true }).fill("welist-demo");
  await booth.getByRole("button", { name: "Entrar a la cabina" }).click();
  await booth.getByRole("button", { name: "Quitar Blinding Lights" }).click();
  await expect(votes).toContainText("Retirada por el DJ · Voto utilizado");
  await booth.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(votes).not.toContainText("Retirada por el DJ");
});
test("an exhausted budget in another tab prevents the pending vote", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Votar Levitating" }).click();
  await other.getByRole("link", { name: "@welist.dj" }).click();
  await other.getByRole("link", { name: "@welist.club" }).click();
  await other.getByRole("button", { name: "Continuar", exact: true }).click();
  await other.getByRole("button", { name: "Votar Tití Me Preguntó" }).click();
  await other.getByRole("button", { name: "Votar One More Time" }).click();
  await expect(other.getByText("Te quedan 0 de 3 votos")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Ya usaste tus tres votos.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Votar Blinding Lights" }),
  ).toContainText("12");
});
test("an unrecorded vote can be safely retried after checking", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await page.getByRole("link", { name: "@welist.dj" }).click();
  await page.getByRole("link", { name: "@welist.club" }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, value) {
      if (
        fail &&
        key === "welist-demo-v2" &&
        value.includes('"votes":["demo-1"]')
      ) {
        fail = false;
        throw new Error("write failed");
      }
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Comprobar voto" }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar voto" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reintentar voto" }).click();
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Votar Blinding Lights" }),
  ).toContainText("13");
});
test("pending song survives reload, and Continue casts exactly one vote", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await expect(page.getByRole("dialog")).toContainText("Blinding Lights");
  await page.getByRole("link", { name: "@welist.dj" }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("Blinding Lights");
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "@welist.club" }).click();
  await page
    .getByRole("button", { name: "Continuar", exact: true })
    .dblclick({ delay: 50 })
    .catch(() => {});
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Votar Blinding Lights" }),
  ).toContainText("13");
});

test("closing the gate cancels the pending vote", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Te quedan 3 de 3 votos")).toBeVisible();
});

test("a removed song cannot be voted after visiting profiles", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await page.getByRole("link", { name: "@welist.dj" }).click();
  await page.getByRole("link", { name: "@welist.club" }).click();
  const booth = await context.newPage();
  await booth.goto("/dj-booth");
  await booth.getByLabel("Contraseña", { exact: true }).fill("welist-demo");
  await booth.getByRole("button", { name: "Entrar a la cabina" }).click();
  await booth.getByRole("button", { name: "Quitar Blinding Lights" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Esta canción no está disponible durante este evento."),
  ).toBeVisible();
  await expect(page.getByText("Te quedan 3 de 3 votos")).toBeVisible();
});

test("an uncertain response is reconciled before retrying", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await page.getByRole("link", { name: "@welist.dj" }).click();
  await page.getByRole("link", { name: "@welist.club" }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, value) {
      original.call(this, key, value);
      if (
        fail &&
        key === "welist-demo-v2" &&
        value.includes('"votes":["demo-1"]')
      ) {
        fail = false;
        throw new Error("response lost");
      }
    };
  });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Comprobar voto" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comprobar voto" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
});

test("a vote cast in another tab is not counted twice", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await other.getByRole("link", { name: "@welist.dj" }).click();
  await other.getByRole("link", { name: "@welist.club" }).click();
  await other.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(other.getByText("Te quedan 2 de 3 votos")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Votar Blinding Lights" }),
  ).toContainText("13");
});

test("ending an event cancels the pending vote", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  const booth = await context.newPage();
  await booth.goto("/dj-booth");
  await booth.getByLabel("Contraseña", { exact: true }).fill("welist-demo");
  await booth.getByRole("button", { name: "Entrar a la cabina" }).click();
  await booth
    .getByRole("button", { name: "Terminar evento", exact: true })
    .click();
  await booth.getByRole("button", { name: "Sí, terminar evento" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("El evento terminó o cambió. Tu voto pendiente se canceló."),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("welist-pending-vote")),
  ).toBeNull();
});
test("gate, three permanent votes, reload and responsive layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Te quedan 3 de 3 votos")).toBeVisible();
  await page.getByRole("button", { name: "Votar Blinding Lights" }).click();
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "@welist.dj" }).click();
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "@welist.club" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
  for (const name of ["Levitating", "Tití Me Preguntó"])
    await page.getByRole("button", { name: "Votar " + name }).click();
  await expect(page.getByText("Te quedan 0 de 3 votos")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Te quedan 0 de 3 votos")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Votar One More Time" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/guest-mobile.png",
    fullPage: true,
  });
});
test("DJ login, archive, undo, end and start event", async ({ page }) => {
  await page.goto("/dj-booth");
  await page.getByLabel("Contraseña", { exact: true }).fill("welist-demo");
  await page.getByRole("button", { name: "Entrar a la cabina" }).click();
  await page.getByRole("button", { name: "Quitar Blinding Lights" }).click();
  await expect(
    page.getByRole("button", { name: "Quitar Blinding Lights" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Quitar Blinding Lights" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Terminar evento", exact: true })
    .click();
  await page.getByRole("button", { name: "Sí, terminar evento" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Nombre del evento").fill("Viernes en WeList");
  await page.getByLabel("Perfil de Instagram 1").fill("dj_test");
  await page.getByLabel("Perfil de Instagram 2").fill("venue_test");
  await page.getByRole("button", { name: "Revisar evento" }).click();
  await page.getByRole("button", { name: "Iniciar evento" }).click();
  await expect(
    page.getByText("Viernes en WeList", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#venue-qr")).toBeVisible();
  await page.screenshot({
    path: "test-results/booth-mobile.png",
    fullPage: true,
  });
});

test("DJ can start an event with only the required Instagram profile", async ({
  page,
}) => {
  await page.goto("/dj-booth");
  await page.getByLabel("Contraseña", { exact: true }).fill("welist-demo");
  await page.getByRole("button", { name: "Entrar a la cabina" }).click();
  await page
    .getByRole("button", { name: "Terminar evento", exact: true })
    .click();
  await page.getByRole("button", { name: "Sí, terminar evento" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Nombre del evento").fill("Solo DJ");
  await page.getByLabel("Perfil de Instagram 1").fill("solo_dj");
  expect(
    await page
      .getByLabel("Perfil de Instagram 2")
      .evaluate((el) => !(el as HTMLInputElement).required),
  ).toBe(true);
  await page.getByRole("button", { name: "Revisar evento" }).click();
  await page.getByRole("button", { name: "Iniciar evento" }).click();
  await expect(page.getByText("Solo DJ", { exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByLabel("Buscar canción o artista").fill("Midnight");
  await page.getByRole("button", { name: "Votar Midnight City" }).click();
  await page.getByRole("link", { name: "@solo_dj" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
});

test("catalog expansion preserves existing requests and vote counts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Buscar canción o artista").fill("The Weeknd");
  const existing = page.getByRole("button", { name: "Votar Blinding Lights" });
  await expect(existing).toContainText("12");
  await page.getByRole("button", { name: "Buscar más canciones" }).click();
  await expect(existing).toHaveCount(1);
  await expect(existing).toContainText("12");
});

test("catalog requests spend one vote and an old tab acknowledges the next event", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Buscar canción o artista").fill("Midnight");
  await page.getByRole("button", { name: "Buscar más canciones" }).click();
  await page.getByRole("button", { name: "Votar Midnight City" }).click();
  await page.getByRole("link", { name: "@welist.dj" }).click();
  await page.getByRole("link", { name: "@welist.club" }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Te quedan 2 de 3 votos")).toBeVisible();
  const booth = await context.newPage();
  await booth.goto("/dj-booth");
  await booth.getByLabel("Contraseña", { exact: true }).fill("welist-demo");
  await booth.getByRole("button", { name: "Entrar a la cabina" }).click();
  await booth
    .getByRole("button", { name: "Terminar evento", exact: true })
    .click();
  await booth.getByRole("button", { name: "Sí, terminar evento" }).click();
  await expect(booth.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("No hay un evento activo.", { exact: false }),
  ).toBeVisible();
  await booth.getByLabel("Nombre del evento").fill("Segunda noche");
  await booth.getByLabel("Perfil de Instagram 1").fill("next_dj");
  await booth.getByLabel("Perfil de Instagram 2").fill("next_venue");
  await booth.getByRole("button", { name: "Revisar evento" }).click();
  await booth.getByRole("button", { name: "Iniciar evento" }).click();
  await expect(
    page.getByRole("dialog", { name: "Nuevo evento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Entrar al evento" }).click();
  await expect(page.getByText("Te quedan 3 de 3 votos")).toBeVisible();
  await page.getByText("Ver tus votos", { exact: false }).click();
  await expect(page.getByRole("region", { name: "Tus votos" })).toContainText(
    "Tus canciones elegidas aparecerán aquí.",
  );
  await expect(page.getByLabel("Buscar canción o artista")).toHaveValue("");
});

test("guest controls stay usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const history = page.locator("details.my-votes");
  await expect(history).not.toHaveAttribute("open", "");
  const summary = history.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(history).toHaveAttribute("open", "");
  await expect(page.getByRole("region", { name: "Tus votos" })).toBeVisible();
  const vote = page.getByRole("button", { name: "Votar Blinding Lights" });
  await expect(vote).toContainText("Votar");
  const size = await vote.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(44);
  expect(size!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
