"use node";
import type { TrackMetadata } from "../validators";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("INVALID_SPOTIFY_RESPONSE");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw Error("INVALID_SPOTIFY_RESPONSE");
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw Error("INVALID_SPOTIFY_RESPONSE");
  return value;
}

export async function getAccessToken(
  id: string,
  secret: string,
): Promise<{ token: string; expiresAt: number }> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("TOKEN_FAILED");
  const body = object(await response.json());
  if (
    typeof body.expires_in !== "number" ||
    !Number.isFinite(body.expires_in) ||
    body.expires_in <= 0
  )
    throw Error("INVALID_SPOTIFY_RESPONSE");
  return {
    token: string(body.access_token),
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

export type SpotifySearch =
  | { kind: "success"; tracks: TrackMetadata[] }
  | { kind: "quota" }
  | { kind: "cooldown"; retryAfterMs: number };

export async function searchTracks(
  token: string,
  term: string,
): Promise<SpotifySearch> {
  const response = await fetch(
    "https://api.spotify.com/v1/search?" +
      new URLSearchParams({ q: term, type: "track", limit: "10" }),
    {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(10000),
    },
  );
  console.log("spotify_provider_call");
  if (response.status === 429) {
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object" && "error" in body) {
      const error = body.error;
      if (
        error &&
        typeof error === "object" &&
        "reason" in error &&
        error.reason === "QUOTA_EXCEEDED"
      )
        return { kind: "quota" };
    }
    const seconds = Number(response.headers.get("Retry-After")) || 60;
    return { kind: "cooldown", retryAfterMs: Math.max(1, seconds) * 1000 };
  }
  if (!response.ok) throw Error("SEARCH_FAILED");
  const body = object(await response.json());
  const tracks = array(object(body.tracks).items)
    .filter(Boolean)
    .map((item): TrackMetadata => {
      const track = object(item);
      const images = array(object(track.album).images);
      const lastImage = images.at(-1);
      return {
        trackId: string(track.id),
        title: string(track.name),
        artist: array(track.artists)
          .map((artist) => string(object(artist).name))
          .join(", "),
        artwork:
          lastImage === undefined ? undefined : string(object(lastImage).url),
        url: string(object(track.external_urls).spotify),
      };
    });
  return { kind: "success", tracks };
}
