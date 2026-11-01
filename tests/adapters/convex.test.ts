import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { createConvexAdapter } from "../../src/data/convex";
import type { SearchResult as BackendSearchResult } from "../../convex/contracts/music";
describe("cloud DJ session state", () => {
  it("translates command rejections and search warnings through the existing adapter", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "existing-token" });
    const client = {
      onUpdate: () => () => {},
      subscribeToConnectionState: () => () => {},
      close: async () => {},
      mutation: vi.fn(async () => ({
        ok: false,
        error: { code: "EXHAUSTED" },
      })),
      action: vi.fn(async (): Promise<BackendSearchResult> => ({
        ok: true,
        data: {
          tracks: [
            {
              trackId: "song",
              title: "Song",
              artist: "Artist",
              url: "https://example.test",
            },
          ],
          source: "local",
          warning: { code: "SEARCH_UNAVAILABLE" },
        },
      })),
    };
    const adapter = createConvexAdapter(
      "https://example.convex.cloud",
      {
        signIn: async () => {},
        signOut: async () => {},
      },
      client,
    );
    try {
      await expect(
        adapter.execute({ kind: "vote", eventId: "event", trackId: "song" }),
      ).rejects.toMatchObject({
        code: "EXHAUSTED",
        message: "Ya usaste tus tres votos.",
      });
      const search = await adapter.search("event", "song");
      expect(search.tracks).toMatchObject([{ id: "song", title: "Song" }]);
      expect(search.error).toBe(
        "Búsqueda no disponible. Inténtalo en un momento.",
      );
      client.action.mockResolvedValueOnce({
        ok: false,
        error: { code: "RATE_LIMITED" },
      });
      expect(await adapter.localSearch("event", "song")).toEqual({
        tracks: [],
        error: "Demasiados intentos. Espera un minuto.",
      });
    } finally {
      adapter.dispose();
      vi.unstubAllGlobals();
    }
  });
  it("preserves guest identity and votes on subscription errors; only verified expiry invalidates them", async () => {
    const values = new Map([["welist-token", "existing-token"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const callbacks = new Map<
      string,
      { value: (data: any) => void; error?: (e: Error) => void }
    >();
    const client = {
      onUpdate: (
        ref: any,
        _args: unknown,
        value: (data: any) => void,
        error?: (e: Error) => void,
      ) => {
        const key = getFunctionName(ref);
        callbacks.set(key, { value, error });
        return () => callbacks.delete(key);
      },
      subscribeToConnectionState: () => () => {},
      mutation: vi.fn(),
      close: async () => {},
    };
    const adapter = createConvexAdapter(
      "https://example.convex.cloud",
      { signIn: async () => {}, signOut: async () => {} },
      client,
    );
    try {
      callbacks.get("events/queries:currentEvent")!.value({
        _id: "event",
        name: "Night",
        status: "live",
        profiles: ["one"],
      });
      callbacks.get("participation/queries:participation")!.value({
        votes: ["song"],
        votedTracks: [],
        used: 1,
        unlocked: true,
        clicks: [0],
      });
      callbacks.get("participation/queries:participation")!.error!(
        new TypeError("fetch failed"),
      );
      callbacks.get("participation/queries:participation")!.error!(
        new Error("Unknown"),
      );
      expect(values.get("welist-token")).toBe("existing-token");
      expect(adapter.getSnapshot().participation.votes).toEqual(["song"]);
      callbacks.get("participation/queries:participation")!.error!(
        Object.assign(new Error("Expired"), { data: "SESSION_EXPIRED" }),
      );
      adapter.dispose();
      await Promise.resolve();
      expect(callbacks.size).toBe(0);
      expect(values.has("welist-token")).toBe(false);
      expect(adapter.getSnapshot().participation.votes).toEqual([]);
      expect(adapter.getSnapshot().sessionExpired).toBe(1);
      expect(client.mutation).not.toHaveBeenCalled();
    } finally {
      adapter.dispose();
      vi.unstubAllGlobals();
    }
  });
  it("waits for backend authorization, restores access, and clears it on logout", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    const subscriptions = new Map<
      string,
      { value: (data: any) => void; error?: (error: Error) => void }
    >();
    const client = {
      onUpdate: (
        ref: any,
        _args: unknown,
        value: (data: any) => void,
        error?: (error: Error) => void,
      ) => {
        const name = getFunctionName(ref);
        subscriptions.set(name, { value, error });
        return () => subscriptions.delete(name);
      },
      subscribeToConnectionState: () => () => {},
      close: async () => {},
    };
    const auth = {
      signIn: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
    };
    try {
      const adapter = createConvexAdapter(
        "https://example.convex.cloud",
        auth,
        client,
      );
      adapter.setAuthState!(true, false);
      expect(adapter.getSnapshot().admin).toBe(false);
      expect(adapter.getSnapshot().authLoading).toBe(true);
      subscriptions.get("events/queries:dashboard")!.value(null);
      expect(adapter.getSnapshot().admin).toBe(true);
      await Promise.resolve();
      adapter.setAuthState!(false, false);
      expect(adapter.getSnapshot().admin).toBe(false);
      expect(adapter.getSnapshot().metrics).toBeNull();
      adapter.setAuthState!(true, false);
      subscriptions.get("events/queries:dashboard")!.error!(
        new Error("UNAUTHORIZED"),
      );
      expect(adapter.getSnapshot().admin).toBe(false);
      expect(adapter.getSnapshot().authLoading).toBe(false);
      await adapter.execute({ kind: "logout" });
      expect(auth.signOut).toHaveBeenCalledOnce();
      adapter.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not attempt signup when login fails", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const client = {
      onUpdate: () => () => {},
      subscribeToConnectionState: () => () => {},
      close: async () => {},
    };
    const auth = {
      signIn: vi.fn(async () => {
        throw Error("invalid");
      }),
      signOut: async () => {},
    };
    try {
      const adapter = createConvexAdapter(
        "https://example.convex.cloud",
        auth,
        client,
      );
      await expect(
        adapter.execute({ kind: "login", password: "wrong" }),
      ).rejects.toThrow();
      expect(auth.signIn).toHaveBeenCalledOnce();
      expect(auth.signIn).toHaveBeenCalledWith(
        "password",
        expect.objectContaining({ flow: "signIn" }),
      );
      adapter.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
