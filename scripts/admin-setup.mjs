import { randomBytes } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const url = process.env.WELIST_CONVEX_URL;
const key = process.env.WELIST_DEPLOY_KEY;
if (!url || !key) {
  console.error(
    "Set WELIST_CONVEX_URL and WELIST_DEPLOY_KEY for the intended Convex deployment.",
  );
  process.exit(1);
}
const password = randomBytes(24).toString("base64url");
const client = new ConvexHttpClient(url);
client.setAdminAuth(key);
await client.action(makeFunctionReference("provision:setup"), { password });
console.log(
  "DJ account provisioned. Save this password in a password manager:",
);
console.log(password);
