import type { SearchResult, Track } from "./types";
export type Search = (
  eventId: string,
  term: string,
  force?: boolean,
) => Promise<SearchResult>;
export type SearchUpdate = {
  tracks: Track[];
  error: string;
  searching: boolean;
};

export async function runSongSearch(
  eventId: string,
  term: string,
  force: boolean,
  localSearch: Search,
  search: Search,
  emit: (update: SearchUpdate) => void,
  isActive: () => boolean,
) {
  let local: Track[] = [];
  try {
    const first = await localSearch(eventId, term);
    if (!isActive()) return;
    local = first.tracks;
    if (first.error) {
      emit({ tracks: local, error: first.error, searching: false });
      return;
    }
    const expand = force || new Set(local.map((t) => t.id)).size < 5;
    emit({ tracks: local, error: "", searching: expand });
    if (!expand) return;
    const result = await search(eventId, term, true);
    if (!isActive()) return;
    const ids = new Set(local.map((t) => t.id));
    emit({
      tracks: [...local, ...result.tracks.filter((t) => !ids.has(t.id))],
      error: result.error ?? "",
      searching: false,
    });
  } catch (error) {
    if (isActive())
      emit({
        tracks: local,
        error: error instanceof Error ? error.message : "No se pudo buscar.",
        searching: false,
      });
  }
}
