import { api } from "../convex/_generated/api.js";
import { ConvexHttpClient } from "convex/browser";
import { mkdir, writeFile } from "node:fs/promises";
import { assertStaging, bounded, requireOk } from "./load-core.mjs";

const report = {
  startedAt: new Date().toISOString(),
  passed: false,
  checks: [],
};
await mkdir("test-results", { recursive: true });
try {
  const url = process.env.WELIST_STAGING_URL;
  if (!url || process.env.WELIST_STAGING_ACK !== "true")
    throw Error(
      "BLOCKED: explicit staging URL and WELIST_STAGING_ACK=true required",
    );
  const client = new ConvexHttpClient(url);
  const call = (kind, name, args = {}) =>
    bounded(() => client[kind](name, args));
  const event = await call("query", api.events.queries.currentEvent);
  assertStaging(await call("query", api.operations.staging.enabled), event);
  const sessions = await Promise.all(
    [0, 1].map(() => call("mutation", api.sessions.mutations.issueSession)),
  );
  if (sessions.some((result) => !result.ok))
    throw Error("Session issuance rate limited");
  const tokens = sessions.map((result) => result.data.token);
  // At most two actual provider searches; never part of the synthetic load run.
  for (const term of [
    "Daft Punk One More Time",
    "The Weeknd Blinding Lights",
  ]) {
    const response = await call("action", api.music.search.actions.search, {
      token: tokens[0],
      eventId: event._id,
      term,
      force: true,
    });
    if (!response.ok || response.data.warning)
      throw Error(
        `Spotify smoke: ${!response.ok ? response.error.code : response.data.warning.code}`,
      );
    const track = response.data.tracks?.find(
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
        await call("mutation", api.participation.mutations.updateGate, {
          token: tokens[0],
          eventId: event._id,
          ...extra,
        }),
      );
    requireOk(
      await call("mutation", api.requests.mutations.requestOrVote, {
        token: tokens[0],
        eventId: event._id,
        trackId: track.trackId,
      }),
    );
    const shared = await call("action", api.music.search.actions.localSearch, {
      token: tokens[1],
      eventId: event._id,
      term: track.title.slice(0, 100),
    });
    if (
      !shared.ok ||
      shared.data.warning ||
      !shared.data.tracks.some(
        (t) => t.trackId === track.trackId && t.votes === 1,
      )
    )
      throw Error("Another guest cannot reuse requested metadata");
    report.checks.push({
      metadata: true,
      artwork: true,
      requested: true,
      shared: true,
      source: response.data.source,
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
