import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { createConvexAdapter } from "../src/data/convex";

describe("cloud DJ session state", () => {
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
      subscriptions.get("admin:dashboard")!.value(null);
      expect(adapter.getSnapshot().admin).toBe(true);
      await Promise.resolve();
      adapter.setAuthState!(false, false);
      expect(adapter.getSnapshot().admin).toBe(false);
      expect(adapter.getSnapshot().metrics).toBeNull();
      adapter.setAuthState!(true, false);
      subscriptions.get("admin:dashboard")!.error!(new Error("UNAUTHORIZED"));
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
