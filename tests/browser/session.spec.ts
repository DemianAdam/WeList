import { test, expect } from "@playwright/test";

test("DJ logout revokes access after reload", async ({ page }) => {
  await page.goto("/dj-booth");
  await page.getByLabel("Contraseña", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Entrar a la cabina" }).click();
  await expect(
    page.getByRole("button", { name: "Salir", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Contraseña", { exact: true }).fill("welist-demo");
  await page.getByRole("button", { name: "Entrar a la cabina" }).click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Entrar a la cabina" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Terminar evento", exact: true }),
  ).toHaveCount(0);
});
