import { catalog, initial, vote } from "../domain";
import type { State } from "../domain";
import type { Adapter, Command, Snapshot } from "./types";
import { CommandError, emptyParticipation } from "./types";
const KEY = "welist-demo-v2";
const GUEST = "welist-demo-guest";
const ADMIN = "welist-demo-admin";
function read(): State {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    return stored ?? structuredClone(initial);
  } catch {
    return structuredClone(initial);
  }
}
export function createMockAdapter(): Adapter {
  let guest = localStorage.getItem(GUEST);
  if (!guest) {
    guest = crypto.randomUUID();
    localStorage.setItem(GUEST, guest);
  }
  const listeners = new Set<() => void>();
  let snapshot: Snapshot;
  const attempts = new Map<string, { count: number; reset: number }>();
  function participationFor(state: State, eventId: string) {
    const participation =
      state.participation[eventId + guest] ?? emptyParticipation;
    const event = state.events.find((e) => e.id === eventId);
    return {
      ...participation,
      votedTracks: participation.votes.flatMap((id) => {
        const track = event?.tracks.find((t) => t.id === id);
        return track ? [track] : [];
      }),
    };
  }
  function refresh() {
    const state = read();
    const event = state.events.find((e) => e.id === state.current) ?? null;
    const ps = Object.entries(state.participation)
      .filter(([key]) => key.startsWith(state.current))
      .map(([, p]) => p);
    const expiry = Number(sessionStorage.getItem(ADMIN));
    snapshot = {
      event,
      participation: participationFor(state, state.current),
      admin: expiry > Date.now(),
      authLoading: false,
      authError: null,
      connected: navigator.onLine,
      loading: false,
      metrics: {
        participants: ps.length,
        profileClicks: [0, 1].map(
          (i) => ps.filter((p) => p.clicks.includes(i)).length,
        ),
        unlocked: ps.filter((p) => p.unlocked).length,
        exhausted: ps.filter((p) => p.votes.length === 3).length,
        votes: ps.reduce((n, p) => n + p.votes.length, 0),
        requests: event?.tracks.length ?? 0,
      },
    };
    listeners.forEach((fn) => fn());
  }
  function limit(key: string, max: number) {
    const old = attempts.get(key);
    if (!old || old.reset < Date.now()) {
      attempts.set(key, { count: 1, reset: Date.now() + 60000 });
      return;
    }
    if (old.count >= max) throw Error("Demasiados intentos. Espera un minuto.");
    old.count++;
  }
  async function execute(command: Command) {
    return navigator.locks.request("welist-demo-state", async () => {
      if (!navigator.onLine) throw Error("Sin conexión. Vuelve a intentarlo.");
      refresh();
      const state = read();
      let result = "Listo.";
      if (command.kind === "login") {
        limit("login", 5);
        if (command.password !== "welist-demo")
          throw Error("Contraseña incorrecta.");
        sessionStorage.setItem(ADMIN, String(Date.now() + 12 * 3600000));
      } else if (command.kind === "logout") sessionStorage.removeItem(ADMIN);
      else if (command.kind === "start") {
        if (!snapshot.admin) throw Error("Inicia sesión.");
        if (snapshot.event?.live)
          throw Error("Primero termina el evento actual.");
        const profiles = command.profiles.map((p) =>
          p.replace(/^@/, "").toLowerCase(),
        );
        if (
          !command.name.trim() ||
          command.name.length > 80 ||
          profiles.length < 1 ||
          profiles.length > 2 ||
          profiles[0] === profiles[1] ||
          profiles.some((p) => !/^[a-z0-9._]{1,30}$/.test(p))
        )
          throw Error("Revisa el nombre y los perfiles.");
        const id = crypto.randomUUID();
        state.events.push({
          id,
          name: command.name.trim(),
          profiles,
          live: true,
          tracks: [],
        });
        state.current = id;
      } else {
        const event = state.events.find((e) => e.id === command.eventId);
        if (!event?.live || event.id !== state.current)
          throw Error("El evento terminó.");
        if (command.kind === "gate") {
          const p = (state.participation[event.id + guest] ??= {
            clicks: [],
            unlocked: false,
            votes: [],
          });
          if (command.confirm) {
            if (p.clicks.length !== event.profiles.length)
              throw Error("Visita los perfiles configurados.");
            p.unlocked = true;
          } else if (
            command.profile !== undefined &&
            Number.isInteger(command.profile) &&
            command.profile >= 0 &&
            command.profile < event.profiles.length
          ) {
            if (!p.clicks.includes(command.profile))
              p.clicks.push(command.profile);
          }
        }
        if (command.kind === "vote") {
          limit("vote", 10);
          result = vote(state, event.id, guest!, command.trackId);
          if (result !== "¡Tu voto ya cuenta!") {
            const code = result.startsWith("Ya votaste")
              ? "DUPLICATE"
              : result.startsWith("Ya usaste")
                ? "EXHAUSTED"
                : result.startsWith("Esta canción")
                  ? "ARCHIVED"
                  : "INVALID_TRACK";
            throw new CommandError(code, result);
          }
        }
        if (command.kind === "end") {
          if (!snapshot.admin) throw Error("Inicia sesión.");
          event.live = false;
          event.endedAt = Date.now();
        }
        if (command.kind === "archive") {
          if (!snapshot.admin) throw Error("Inicia sesión.");
          const t = event.tracks.find((t) => t.id === command.trackId);
          if (!t) throw Error("Canción no encontrada.");
          if (command.undo) {
            if (!t.archived || Date.now() - t.archived > 10000)
              throw Error("El tiempo para deshacer terminó.");
            t.archived = undefined;
          } else if (!t.archived) t.archived = Date.now();
        }
      }
      state.events = state.events.filter(
        (e) => !e.endedAt || e.endedAt > Date.now() - 30 * 86400000,
      );
      const ids = new Set(state.events.map((e) => e.id));
      for (const key of Object.keys(state.participation))
        if (![...ids].some((id) => key.startsWith(id)))
          delete state.participation[key];
      localStorage.setItem(KEY, JSON.stringify(state));
      refresh();
      return result;
    });
  }
  refresh();
  window.addEventListener("storage", refresh);
  window.addEventListener("online", refresh);
  window.addEventListener("offline", refresh);
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    execute,
    getParticipation: async (eventId) => {
      if (!navigator.onLine) throw Error("Sin conexión. Vuelve a intentarlo.");
      const state = read();
      if (
        state.current !== eventId ||
        !state.events.find((e) => e.id === eventId)?.live
      )
        throw new CommandError("EVENT_CLOSED", "El evento terminó.");
      return participationFor(state, eventId);
    },
    search: async (eventId, term) => {
      const event = read().events.find((e) => e.id === eventId);
      if (!event?.live) throw Error("El evento terminó.");
      const q = term.trim().toLocaleLowerCase();
      limit("search", 30);
      return {
        tracks: catalog
          .filter((t) =>
            (t.title + " " + t.artist).toLocaleLowerCase().includes(q),
          )
          .slice(0, 10),
      };
    },
    dispose: () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    },
  };
}
