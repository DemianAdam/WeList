import { useEffect, useState } from "react";
import type { Track, SearchResult } from "../data/types";
export function useSongSearch(
  eventId: string | undefined,
  term: string,
  enabled: boolean,
  force: boolean,
  search: (
    eventId: string,
    term: string,
    force?: boolean,
  ) => Promise<SearchResult>,
) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([eventId, term, force, retry]);
  const [response, setResponse] = useState<{
    key: string;
    tracks: Track[];
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!enabled || !eventId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      search(eventId, term, force)
        .then((result) => {
          if (!cancelled)
            setResponse({
              key,
              tracks: result.tracks,
              error: result.error ?? "",
            });
        })
        .catch((error) => {
          if (!cancelled)
            setResponse({
              key,
              tracks: [],
              error:
                error instanceof Error ? error.message : "No se pudo buscar.",
            });
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, eventId, term, enabled, force, search]);
  const current = response?.key === key ? response : null;
  return {
    results: enabled ? (current?.tracks ?? []) : [],
    searchError: enabled ? (current?.error ?? "") : "",
    searching: enabled && !current,
    retrySearch: () => setRetry((n) => n + 1),
  };
}
