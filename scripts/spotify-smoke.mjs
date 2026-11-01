import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { mkdir, writeFile } from "node:fs/promises";
import { assertStaging, bounded, requireOk } from "./load-core.mjs";

const report = {
  startedAt: new Date().toISOString(),
  passed: false,
  checks: [],
};
await mkdir("test-results", { recursive: true });
const ref = (name) => makeFunctionReference(name);
try {
  const url = process.env.WELIST_STAGING_URL;
  if (!url || process.env.WELIST_STAGING_ACK !== "true")
    throw Error(
      "BLOCKED: explicit staging URL and WELIST_STAGING_ACK=true required",
    );
  const client = new ConvexHttpClient(url);
  const call = (kind, name, args = {}) =>
    bounded(() => client[kind](ref(name), args));
  const event = await call("query", "guest:current");
  assertStaging(await call("query", "staging:enabled"), event);
  const tokens = await Promise.all(
    [0, 1].map(() => call("mutation", "guest:issueSession")),
  );
  if (tokens.some((token) => token === "RATE_LIMITED"))
    throw Error("Session issuance rate limited");
  // At most two actual provider searches; never part of the synthetic load run.
  for (const term of [
    "Daft Punk One More Time",
    "The Weeknd Blinding Lights",
  ]) {
    const response = await call("action", "services:search", {
      token: tokens[0],
      eventId: event._id,
      term,
      force: true,
    });
    if (response.error) throw Error(`Spotify smoke: ${response.error}`);
    const track = response.tracks?.find(
      (t) =>
        t.title &&
        t.artist &&
        t.trackId &&
        /^https:\/\/open.spotify.com\/track\//.test(t.url),
    );
    if (!track) throw Error("Spotify returned no usable metadata");
    if (!track.artwork || !/^https:\/\/i\.scdn\.co\//.test(track.artwork))
      throw Error("Missing Spotify artwork");
    for (const extra of [{ profile: 0, confirm: false }, { confirm: true }])
      requireOk(
        await call("mutation", "guest:gate", {
          token: tokens[0],
          eventId: event._id,
          ...extra,
        }),
      );
    requireOk(
      await call("mutation", "guest:requestOrVote", {
        token: tokens[0],
        eventId: event._id,
        trackId: track.trackId,
      }),
    );
    const shared = await call("action", "services:localSearch", {
      token: tokens[1],
      eventId: event._id,
      term: track.title.slice(0, 100),
    });
    if (
      shared.error ||
      !shared.tracks.some((t) => t.trackId === track.trackId && t.votes === 1)
    )
      throw Error("Another guest cannot reuse requested metadata");
    report.checks.push({
      metadata: true,
      artwork: true,
      requested: true,
      shared: true,
      source: response.source,
    });
  }
  report.passed = true;
} catch (error) {
  // Only controlled validation messages are persisted; never raw transport errors.
  report.error =
    /^(BLOCKED:|Spotify smoke:|Session issuance|Spotify returned|Missing Spotify|Another guest)/.test(
      error.message,
    )
      ? error.message
      : "Staging/provider operation failed; inspect deployment logs";
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    "test-results/spotify-smoke.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
