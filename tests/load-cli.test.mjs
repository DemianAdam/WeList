// @vitest-environment node
import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

function removeTestDirectory(output) {
  if (
    dirname(resolve(output)) !== resolve(tmpdir()) ||
    !basename(output).startsWith("welist-load-test-")
  )
    throw Error("Refusing to remove an unexpected temporary path");
  rmSync(output, { recursive: true, force: true });
}

it("CLI exits nonzero and saves a blocked report without explicit staging credentials", () => {
  const output = mkdtempSync(join(tmpdir(), "welist-load-test-"));
  try {
    const env = { ...process.env };
    delete env.WELIST_STAGING_URL;
    delete env.WELIST_STAGING_DEPLOY_KEY;
    const child = spawnSync(
      process.execPath,
      [
        resolve("scripts/staging-load.mjs"),
        "--i-understand-staging",
        "--output",
        output,
      ],
      { env, encoding: "utf8", timeout: 10000, windowsHide: true },
    );
    expect(child.status).toBe(1);
    const report = JSON.parse(
      readFileSync(join(output, readdirSync(output)[0]), "utf8"),
    );
    expect(report.error).toContain("Staging preflight failed");
    expect(report.runs).toEqual([]);
    expect(report.cleanup).toBe("not attempted");
  } finally {
    // mkdtemp created this specific temporary directory for this test only.
    removeTestDirectory(output);
  }
});
