import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createMockAdapter } from "./mock";
import { createConvexAdapter } from "./convex";
import { DataContext, isDemo } from "./context";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex } from "convex/react";
import { useConvexAuth } from "convex/react";
import type { Adapter } from "./types";

function AdapterProvider({
  children,
  adapter,
}: {
  children: ReactNode;
  adapter: Adapter;
}) {
  useEffect(() => () => adapter.dispose(), [adapter]);
  return (
    <DataContext.Provider value={adapter}>{children}</DataContext.Provider>
  );
}

function CloudDataProvider({ children }: { children: ReactNode }) {
  const authActions = useAuthActions();
  const convex = useConvex();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [adapter] = useState(() => {
    const url = import.meta.env.VITE_CONVEX_URL;
    if (!url) throw Error("VITE_CONVEX_URL is required in Convex mode");
    return createConvexAdapter(url, authActions, convex);
  });
  useEffect(() => {
    adapter.setAuthState?.(isAuthenticated, isLoading);
  }, [adapter, isAuthenticated, isLoading]);
  return <AdapterProvider adapter={adapter} children={children} />;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [adapter] = useState(() => (isDemo ? createMockAdapter() : null));
  if (isDemo) return <AdapterProvider adapter={adapter!} children={children} />;
  return <CloudDataProvider>{children}</CloudDataProvider>;
}
