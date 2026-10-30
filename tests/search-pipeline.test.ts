import { describe, expect, it, vi } from "vitest";
import { runSongSearch, type SearchUpdate } from "../src/data/searchPipeline";
import type { Track } from "../src/data/types";

const track = (id: string): Track => ({
  id,
  title: id,
  artist: "Artist",
  votes: 0,
});

describe("two-stage search", () => {
  it("shows local results before a delayed provider and merges duplicates", async () => {
    const local = track("local");
    let resolve!: (value: { tracks: Track[] }) => void;
    const provider = vi.fn(
      () =>
        new Promise<{ tracks: Track[] }>((r) => {
          resolve = r;
        }),
    );
    const updates: SearchUpdate[] = [];
    const done = runSongSearch(
      "event",
      "query",
      false,
      async () => ({ tracks: [local] }),
      provider,
      (update) => updates.push(update),
      () => true,
    );
    await Promise.resolve();
    expect(updates).toEqual([{ tracks: [local], error: "", searching: true }]);
    resolve({ tracks: [local, track("remote")] });
    await done;
    expect(updates[1].tracks.map((t) => t.id)).toEqual(["local", "remote"]);
    expect(updates[1].searching).toBe(false);
  });
  it("avoids provider calls for five distinct local songs unless manually expanded", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => track(String(i)));
    const provider = vi.fn(async () => ({ tracks: [] }));
    await runSongSearch(
      "event",
      "query",
      false,
      async () => ({ tracks: rows }),
      provider,
      () => {},
      () => true,
    );
    expect(provider).not.toHaveBeenCalled();
    await runSongSearch(
      "event",
      "query",
      true,
      async () => ({ tracks: rows }),
      provider,
      () => {},
      () => true,
    );
    expect(provider).toHaveBeenCalledOnce();
  });
  it("retains local songs after failure and ignores a stale provider response", async () => {
    const updates: SearchUpdate[] = [];
    await runSongSearch(
      "event",
      "query",
      false,
      async () => ({ tracks: [track("local")] }),
      async () => {
        throw Error("offline");
      },
      (update) => updates.push(update),
      () => true,
    );
    expect(updates.at(-1)).toMatchObject({
      tracks: [track("local")],
      error: "offline",
      searching: false,
    });
    let active = true;
    let resolve!: (value: { tracks: Track[] }) => void;
    const done = runSongSearch(
      "event",
      "old",
      false,
      async () => ({ tracks: [] }),
      () =>
        new Promise((r) => {
          resolve = r;
        }),
      (update) => updates.push(update),
      () => active,
    );
    await Promise.resolve();
    active = false;
    const count = updates.length;
    resolve({ tracks: [track("stale")] });
    await done;
    expect(updates).toHaveLength(count);
  });
});
