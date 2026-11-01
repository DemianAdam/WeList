import { afterEach, expect, it, vi } from "vitest";
import {
  getAccessToken,
  searchTracks,
} from "../../convex/music/spotify/client.node";

afterEach(() => vi.unstubAllGlobals());

it("rejects malformed credentials and track metadata at the provider boundary", async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ access_token: "token" })),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(getAccessToken("id", "secret")).rejects.toThrow(
    "INVALID_SPOTIFY_RESPONSE",
  );
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ tracks: { items: [{ id: "untrusted" }] } })),
  );
  await expect(searchTracks("token", "song")).rejects.toThrow(
    "INVALID_SPOTIFY_RESPONSE",
  );
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ tracks: {} })));
  await expect(searchTracks("token", "song")).rejects.toThrow(
    "INVALID_SPOTIFY_RESPONSE",
  );
});

it("distinguishes ordinary cooldown from exhausted provider quota", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response("not json", {
        status: 429,
        headers: { "Retry-After": "42" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await searchTracks("token", "song")).toEqual({
    kind: "cooldown",
    retryAfterMs: 42000,
  });
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: { reason: "QUOTA_EXCEEDED" } }), {
      status: 429,
    }),
  );
  expect(await searchTracks("token", "song")).toEqual({ kind: "quota" });
});
