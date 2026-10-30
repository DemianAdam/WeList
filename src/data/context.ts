import { createContext, useContext, useSyncExternalStore } from "react";
import type { Adapter } from "./types";
export const isDemo = import.meta.env.VITE_DATA_MODE !== "convex";
export const DataContext = createContext<Adapter | null>(null);
export function useData() {
  const adapter = useContext(DataContext);
  if (!adapter) throw Error("Missing DataProvider");
  const snapshot = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  return {
    ...snapshot,
    execute: adapter.execute,
    getParticipation: adapter.getParticipation,
    localSearch: adapter.localSearch,
    search: adapter.search,
    loadMore: adapter.loadMore,
  };
}
