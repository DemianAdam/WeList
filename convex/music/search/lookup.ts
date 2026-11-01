import type { Infer } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import { live } from "../../events/access";
import type {
  cachedSongSearchArgs,
  visibleProviderTracksArgs,
  localSearchArgs,
} from "./validators";
export async function cachedSongSearch(
  ctx: QueryCtx,
  { eventId, term }: Infer<typeof cachedSongSearchArgs>,
) {
  await live(ctx, eventId);
  const rows = await ctx.db
    .query("eventTracks")
    .withSearchIndex("search", (q) =>
      q.search("searchText", term).eq("eventId", eventId),
    )
    .take(100);
  const terms = term.split(/\s+/).filter(Boolean);
  const valid = rows.filter(
    (row) =>
      row.expiresAt > Date.now() &&
      terms.every((part) =>
        row.searchText.split(/\s+/).some((word) => word.startsWith(part)),
      ),
  );
  const requests = await Promise.all(
    valid.map((row) =>
      ctx.db
        .query("requests")
        .withIndex("event_track", (q) =>
          q.eq("eventId", eventId).eq("trackId", row.trackId),
        )
        .unique(),
    ),
  );
  return valid.flatMap((row, i) =>
    requests[i]?.archived
      ? []
      : [
          {
            trackId: row.trackId,
            title: row.title,
            artist: row.artist,
            artwork: row.artwork,
            url: row.url,
            votes: requests[i]?.votes ?? 0,
            _id: requests[i]?._id,
          },
        ],
  );
}

export async function visibleProviderTracks(
  ctx: QueryCtx,
  { eventId, tracks }: Infer<typeof visibleProviderTracksArgs>,
) {
  await live(ctx, eventId);
  const requests = await Promise.all(
    tracks.map((track) =>
      ctx.db
        .query("requests")
        .withIndex("event_track", (q) =>
          q.eq("eventId", eventId).eq("trackId", track.trackId),
        )
        .unique(),
    ),
  );
  return tracks.flatMap((track, i) =>
    requests[i]?.archived
      ? []
      : [{ ...track, votes: requests[i]?.votes ?? 0, _id: requests[i]?._id }],
  );
}

export async function localSearch(
  ctx: QueryCtx,
  { eventId, term }: Infer<typeof localSearchArgs>,
) {
  await live(ctx, eventId);
  const rows = await ctx.db
    .query("requests")
    .withIndex("event", (q) => q.eq("eventId", eventId))
    .collect();
  return rows
    .filter(
      (t) =>
        !t.archived &&
        (t.title + " " + t.artist).toLocaleLowerCase().includes(term),
    )
    .slice(0, 10)
    .map(({ _id, trackId, title, artist, artwork, url, votes }) => ({
      _id,
      votes,
      trackId,
      title,
      artist,
      artwork,
      url,
    }));
}
