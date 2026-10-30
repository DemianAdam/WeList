import { useEffect, useState } from "react";
import type { Track, SearchResult } from "../data/types";
import { runSongSearch } from "../data/searchPipeline";

type Search = (
  eventId: string,
  term: string,
  force?: boolean,
) => Promise<SearchResult>;
export function useSongSearch(
  eventId: string | undefined,
  term: string,
  enabled: boolean,
  force: boolean,
  localSearch: Search,
  search: Search,
) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([eventId, term]);
  const [response, setResponse] = useState<{
    key: string;
    tracks: Track[];
    error: string;
    searching: boolean;
  } | null>(null);
  useEffect(() => {
    if (!enabled || !eventId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void runSongSearch(
        eventId,
        term,
        force,
        localSearch,
        search,
        (update) => setResponse({ key, ...update }),
        () => !cancelled,
      );
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, eventId, term, enabled, force, retry, localSearch, search]);
  const current = response?.key === key ? response : null;
  return {
    results: enabled ? (current?.tracks ?? []) : [],
    searchError: enabled ? (current?.error ?? "") : "",
    searching: enabled && (!current || current.searching),
    retrySearch: () => setRetry((n) => n + 1),
  };
}
