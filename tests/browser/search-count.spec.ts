import { test, expect } from "@playwright/test";

test("search displays songs without an aggregate count", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Buscar canción o artista").fill("Blinding Lights");
  await expect(page.locator("article.track")).toHaveCount(1);
  const resultsHeader = page
    .getByRole("heading", { name: "Resultados", exact: true })
    .locator("..");
  await expect(resultsHeader).not.toContainText(/\d+ CANCIONES/);
  await expect(page.getByText("Te quedan 3 de 3 votos")).toBeVisible();
});
