"use node";
import { v } from "convex/values";
import { anyApi } from "convex/server";
import { action } from "./lib/server";
export const search = action({
  args: {
    token: v.string(),
    eventId: v.id("events"),
    term: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, eventId, term, force }): Promise<unknown> => {
    const normalized = term.trim().replace(/\s+/g, " ").toLowerCase();
    if (normalized.length < 2 || normalized.length > 100) return { tracks: [] };
    const key = `${eventId}:${normalized}`;
    const permit = await ctx.runMutation(anyApi.internal.searchPermit, {
      token,
      eventId,
    });
    if (permit.error) return permit;
    const requested = await ctx.runQuery(anyApi.internal.localSearch, {
      eventId,
      term: normalized,
    });
    const cached = await ctx.runQuery(anyApi.internal.cachedSongSearch, {
      eventId,
      term: normalized,
    });
    console.log(cached.length ? "song_cache_hit" : "song_cache_miss");
    const unique = (tracks: any[]) => [
      ...new Map(tracks.map((t) => [t.trackId, t])).values(),
    ];
    const local = unique([
      ...requested,
      ...cached.filter(
        (t: any) => !requested.some((r: any) => r.trackId === t.trackId),
      ),
    ]);
    if (local.length >= 5 && !force) {
      console.log("song_cache_threshold_hit");
      return { tracks: local, source: "local" };
    }
    const merge = async (tracks: any[], source: string) => {
      const visible = await ctx.runQuery(
        anyApi.internal.visibleProviderTracks,
        { eventId, tracks },
      );
      return {
        tracks: unique([
          ...local,
          ...visible.filter(
            (t: any) => !local.some((r: any) => r.trackId === t.trackId),
          ),
        ]),
        source,
      };
    };
    const owner = crypto.randomUUID();
    let acquired: any;
    const deadline = Date.now() + 28000;
    do {
      acquired = await ctx.runMutation(anyApi.internal.searchLease, {
        key,
        owner,
        eventId,
      });
      if (acquired.error) return { tracks: local, error: acquired.error };
      if (acquired.tracks) return await merge(acquired.tracks, "cache");
      if (!acquired.waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    if (acquired.waiting) return { tracks: local, error: "SEARCH_UNAVAILABLE" };
    try {
      let access = acquired.provider?.token;
      if (!access || acquired.provider.expiresAt < Date.now() + 60000) {
        const id = process.env.SPOTIFY_CLIENT_ID,
          secret = process.env.SPOTIFY_CLIENT_SECRET;
        if (!id || !secret) {
          console.warn("spotify_search_failure");
          return { tracks: local, error: "SEARCH_NOT_CONFIGURED" };
        }
        const res = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            Authorization:
              "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw Error("TOKEN_FAILED");
        const body = await res.json();
        access = body.access_token;
        await ctx.runMutation(anyApi.internal.saveProvider, {
          token: access,
          expiresAt: Date.now() + body.expires_in * 1000,
          blockedUntil: 0,
        });
      }
      const res = await fetch(
        "https://api.spotify.com/v1/search?" +
          new URLSearchParams({ q: normalized, type: "track", limit: "10" }),
        {
          headers: { Authorization: "Bearer " + access },
          signal: AbortSignal.timeout(10000),
        },
      );
      console.log("spotify_provider_call");
      if (res.status === 429) {
        console.warn("spotify_search_failure");
        const seconds = Number(res.headers.get("Retry-After")) || 60;
        await ctx.runMutation(anyApi.internal.saveProvider, {
          token: access,
          expiresAt: acquired.provider?.expiresAt || 0,
          blockedUntil: Date.now() + Math.max(1, seconds) * 1000,
        });
        return { tracks: local, error: "SEARCH_UNAVAILABLE" };
      }
      if (!res.ok) throw Error("SEARCH_FAILED");
      const data = await res.json();
      const tracks = (data.tracks?.items || [])
        .filter(Boolean)
        .map(
          (t: {
            id: string;
            name: string;
            artists: { name: string }[];
            album: { images: { url: string }[] };
            external_urls: { spotify: string };
          }) => ({
            trackId: t.id,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(", "),
            artwork: t.album.images.at(-1)?.url,
            url: t.external_urls.spotify,
          }),
        );
      const saved = await ctx.runMutation(anyApi.internal.cacheSearch, {
        key,
        owner,
        eventId,
        tracks,
      });
      if (!saved) return { tracks: local, error: "SEARCH_UNAVAILABLE" };
      return await merge(tracks, "spotify");
    } catch {
      console.warn("spotify_search_failure");
      return { tracks: local, error: "SEARCH_UNAVAILABLE" };
    } finally {
      await ctx.runMutation(anyApi.internal.releaseSearchLease, { key, owner });
    }
  },
});
