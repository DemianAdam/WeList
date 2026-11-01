import type { SearchTrack } from "../../contracts/music";
export const normalizeTerm = (term: string) =>
  term.trim().replace(/\s+/g, " ").toLowerCase();

/** Earlier results retain precedence and ordering. */
export const uniqueTracks = (tracks: SearchTrack[]): SearchTrack[] => {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.trackId)) return false;
    seen.add(track.trackId);
    return true;
  });
};
