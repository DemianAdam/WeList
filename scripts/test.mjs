import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = resolve(root, "node_modules/.cache/welist-tests");
mkdirSync(cache, { recursive: true });
// Keep Vitest's transformed modules on the project filesystem. Windows sandbox
// temporary folders can otherwise lose SSR files between worker imports.
const temporary = mkdtempSync(join(cache, "run-"));
if (dirname(resolve(temporary)) !== cache)
  throw Error("Unexpected test temporary directory");
try {
  const child = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/vitest/vitest.mjs"),
      "run",
      ...process.argv.slice(2),
    ],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        TEMP: temporary,
        TMP: temporary,
        TMPDIR: temporary,
      },
    },
  );
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally {
  // Delete only this run's directory beneath the explicitly resolved cache.
  rmSync(temporary, { recursive: true, force: true });
}
