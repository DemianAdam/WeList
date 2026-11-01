"use node";
import type {
  SearchResult,
  SearchLease,
  SearchTrack,
  SearchCode,
  SearchSource,
} from "../../contracts/music";
import type { TrackMetadata } from "../validators";
import { getAccessToken, searchTracks } from "../spotify/client.node";
import { normalizeTerm, uniqueTracks } from "./normalization";
import type { Infer } from "convex/values";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { success, failure } from "../../contracts/results";
import type { localActionArgs, searchArgs } from "./validators";
export async function localSearch(
  ctx: ActionCtx,
  { token, eventId, term }: Infer<typeof localActionArgs>,
): Promise<SearchResult> {
  const key = normalizeTerm(term);
  if (key.length < 2 || key.length > 100)
    return success({ tracks: [], source: "local" });
  const permit = await ctx.runMutation(
    internal.music.search.mutations.localSearchPermit,
    {
      token,
      eventId,
    },
  );
  if (permit.error) return failure(permit.error);
  const requested = await ctx.runQuery(
    internal.music.search.queries.localSearch,
    {
      eventId,
      term: key,
    },
  );
  const cached = await ctx.runQuery(
    internal.music.search.queries.cachedSongSearch,
    {
      eventId,
      term: key,
    },
  );
  console.log(cached.length ? "song_cache_hit" : "song_cache_miss");
  const ids = new Set(requested.map((t) => t.trackId));
  return success({
    tracks: [...requested, ...cached.filter((t) => !ids.has(t.trackId))],
    source: "local",
  });
}

export async function search(
  ctx: ActionCtx,
  { token, eventId, term, force }: Infer<typeof searchArgs>,
): Promise<SearchResult> {
  const normalized = normalizeTerm(term);
  if (normalized.length < 2 || normalized.length > 100)
    return success({ tracks: [], source: "local" });
  const key = `${eventId}:${normalized}`;
  const permit = await ctx.runMutation(
    internal.music.search.mutations.searchPermit,
    {
      token,
      eventId,
    },
  );
  if (permit.error) return failure(permit.error);
  const requested = await ctx.runQuery(
    internal.music.search.queries.localSearch,
    {
      eventId,
      term: normalized,
    },
  );
  const cached = await ctx.runQuery(
    internal.music.search.queries.cachedSongSearch,
    {
      eventId,
      term: normalized,
    },
  );
  console.log(cached.length ? "song_cache_hit" : "song_cache_miss");
  const local = uniqueTracks([
    ...requested,
    ...cached.filter((t) => !requested.some((r) => r.trackId === t.trackId)),
  ]);
  if (local.length >= 5 && !force) {
    console.log("song_cache_threshold_hit");
    return success({ tracks: local, source: "local" });
  }
  const merge = async (
    tracks: TrackMetadata[],
    source: SearchSource,
  ): Promise<SearchResult> => {
    const visible = await ctx.runQuery(
      internal.music.search.queries.visibleProviderTracks,
      { eventId, tracks },
    );
    return success({
      tracks: uniqueTracks([
        ...local,
        ...visible.filter((t) => !local.some((r) => r.trackId === t.trackId)),
      ]),
      source,
    });
  };
  const owner = crypto.randomUUID();
  let acquired: SearchLease;
  const deadline = Date.now() + 28000;
  do {
    acquired = await ctx.runMutation(
      internal.music.search.mutations.searchLease,
      {
        key,
        owner,
        eventId,
      },
    );
    if (acquired.error) return degraded(local, acquired.error);
    if (acquired.tracks) return await merge(acquired.tracks, "cache");
    if (!acquired.waiting) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  if (acquired.waiting) return degraded(local, "SEARCH_UNAVAILABLE");
  try {
    let access = acquired.provider?.token;
    if (!access || (acquired.provider?.expiresAt ?? 0) < Date.now() + 60000) {
      const id = process.env.SPOTIFY_CLIENT_ID,
        secret = process.env.SPOTIFY_CLIENT_SECRET;
      if (!id || !secret) {
        console.warn("spotify_search_failure");
        return degraded(local, "SEARCH_NOT_CONFIGURED");
      }
      const credentials = await getAccessToken(id, secret);
      access = credentials.token;
      await ctx.runMutation(internal.music.spotify.mutations.saveProvider, {
        ...credentials,
        blockedUntil: 0,
      });
    }
    const response = await searchTracks(access, normalized);
    if (response.kind === "quota") {
      await ctx.runMutation(internal.music.spotify.mutations.setQuota, {
        owner,
        exhausted: true,
      });
      return degraded(local, "QUOTA_EXCEEDED");
    }
    if (response.kind === "cooldown") {
      await ctx.runMutation(internal.music.spotify.mutations.saveProvider, {
        token: access,
        expiresAt: acquired.provider?.expiresAt || 0,
        blockedUntil: Date.now() + response.retryAfterMs,
      });
      return degraded(local, "SEARCH_UNAVAILABLE");
    }
    const tracks = response.tracks;
    const saved = await ctx.runMutation(
      internal.music.search.mutations.cacheSearch,
      {
        key,
        owner,
        eventId,
        tracks,
      },
    );
    if (!saved) return degraded(local, "SEARCH_UNAVAILABLE");
    await ctx.runMutation(internal.music.spotify.mutations.setQuota, {
      owner,
      exhausted: false,
    });
    return await merge(tracks, "spotify");
  } catch {
    console.warn("spotify_search_failure");
    return degraded(local, "SEARCH_UNAVAILABLE");
  } finally {
    await ctx.runMutation(internal.music.search.mutations.releaseSearchLease, {
      key,
      owner,
    });
  }
}

function degraded(tracks: SearchTrack[], code: SearchCode): SearchResult {
  return success({ tracks, source: "local", warning: { code } });
}
