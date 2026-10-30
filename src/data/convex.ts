import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type {
  Adapter,
  Command,
  ConvexAuthBridge,
  Snapshot,
  Track,
} from "./types";
import { CommandError, emptyParticipation } from "./types";
const messages: Record<string, string> = {
  OK: "¡Listo!",
  DUPLICATE: "Ya votaste esta canción.",
  ARCHIVED: "Esta canción no está disponible durante este evento.",
  EXHAUSTED: "Ya usaste tus tres votos.",
  GATE_REQUIRED: "Visita los perfiles configurados para participar.",
  RATE_LIMITED: "Demasiados intentos. Espera un minuto.",
  INVALID_TRACK: "Busca la canción nuevamente.",
  EVENT_CLOSED: "El evento terminó. Tu voto no se registró.",
  SESSION_EXPIRED: "Tu sesión venció. Vuelve a participar.",
  SEARCH_UNAVAILABLE: "Búsqueda no disponible. Inténtalo en un momento.",
  SEARCH_NOT_CONFIGURED: "Spotify aún no está configurado.",
};
export function createConvexAdapter(
  url: string,
  auth: ConvexAuthBridge,
  connectedClient?: unknown,
): Adapter {
  const client: any = connectedClient ?? new ConvexClient(url);
  if (connectedClient && !client.onUpdate) {
    client.onUpdate = (
      query: unknown,
      args: unknown,
      callback: (value: unknown) => void,
      onError?: (error: Error) => void,
    ) => {
      const watch = client.watchQuery(query, args);
      const emit = () => {
        try {
          const result = watch.localQueryResult();
          if (result !== undefined) callback(result);
        } catch (error) {
          onError?.(error as Error);
        }
      };
      const unsubscribe = watch.onUpdate(emit);
      emit();
      return unsubscribe;
    };
  }
  let token = localStorage.getItem("welist-token") || "";
  let admin = false;
  let authenticated = false;
  let eventId = "";
  let visibleLimit = 50;
  let issuing: Promise<void> | null = null;
  async function ensureGuest() {
    if (token) return;
    issuing ??= issueGuest()
      .then((value) => {
        token = value;
        localStorage.setItem("welist-token", token);
        watch();
      })
      .finally(() => {
        issuing = null;
      });
    await issuing;
  }
  let snapshot: Snapshot = {
    event: null,
    participation: emptyParticipation,
    admin: false,
    authLoading: true,
    authError: null,
    metrics: null,
    connected: true,
    loading: true,
  };
  const listeners = new Set<() => void>();
  let children: (() => void)[] = [];
  const emit = () => listeners.forEach((fn) => fn());
  const mutation = (name: string, args: Record<string, unknown>) =>
    client.mutation(makeFunctionReference<"mutation">(name), args);
  async function issueGuest() {
    const response = await mutation("guest:issueSession", {});
    if (response === "RATE_LIMITED")
      throw Error("Demasiados accesos. Espera un minuto.");
    return response as string;
  }
  type RawTrack = {
    trackId: string;
    _id: string;
    title: string;
    artist: string;
    votes?: number;
    archived?: boolean;
    removedAt?: number;
    artwork?: string;
    url?: string;
  };
  const track = (t: RawTrack): Track => ({
    id: t.trackId,
    requestId: t._id,
    title: t.title,
    artist: t.artist,
    votes: t.votes ?? 0,
    archived: t.archived ? (t.removedAt ?? 1) : undefined,
    artwork: t.artwork,
    url: t.url,
  });
  function watch() {
    children.forEach((fn) => fn());
    children = [];
    if (eventId && !admin)
      children.push(
        client.onUpdate(
          makeFunctionReference<"query">("guest:leaderboard"),
          { eventId, limit: visibleLimit },
          (rows: any[]) => {
            if (snapshot.event) {
              snapshot = {
                ...snapshot,
                event: { ...snapshot.event, tracks: rows.map(track) },
              };
              emit();
            }
          },
        ),
      );
    if (token && eventId)
      children.push(
        client.onUpdate(
          makeFunctionReference<"query">("guest:participation"),
          { eventId, token },
          (p: any) => {
            snapshot = {
              ...snapshot,
              participation: {
                ...p,
                votedTracks: (p.votedTracks ?? []).map(track),
              },
            };
            emit();
          },
          () => {
            localStorage.removeItem("welist-token");
            token = "";
            snapshot = { ...snapshot, participation: emptyParticipation };
            emit();
          },
        ),
      );
    if (authenticated)
      children.push(
        client.onUpdate(
          makeFunctionReference<"query">("admin:dashboard"),
          {},
          (data: any) => {
            const newlyAuthorized = !admin;
            admin = true;
            snapshot = {
              ...snapshot,
              admin: true,
              authLoading: false,
              authError: null,
              metrics: data?.metrics ?? null,
              event: data?.event
                ? {
                    id: data.event._id,
                    name: data.event.name,
                    profiles: data.event.profiles,
                    live: data.event.status === "live",
                    tracks: data.requests.map(track),
                  }
                : snapshot.event,
            };
            emit();
            if (newlyAuthorized)
              queueMicrotask(() => {
                if (admin && authenticated) watch();
              });
          },
          () => {
            admin = false;
            snapshot = {
              ...snapshot,
              admin: false,
              authLoading: false,
              authError:
                "No se pudo verificar el acceso. Comprueba tu conexión y autorización.",
              metrics: null,
            };
            emit();
          },
        ),
      );
  }
  const unsubscribe = client.onUpdate(
    makeFunctionReference<"query">("guest:current"),
    {},
    (e: any) => {
      const changed = (e?._id ?? "") !== eventId;
      eventId = e?._id ?? "";
      snapshot = {
        ...snapshot,
        loading: false,
        event: e
          ? {
              id: e._id,
              name: e.name,
              profiles: e.profiles,
              live: e.status === "live",
              tracks: changed ? [] : (snapshot.event?.tracks ?? []),
            }
          : null,
        participation: changed ? emptyParticipation : snapshot.participation,
      };
      if (changed || children.length === 0) watch();
      emit();
    },
    () => {
      snapshot = { ...snapshot, loading: false, connected: false };
      emit();
    },
  );
  const connection = client.subscribeToConnectionState((state: any) => {
    snapshot = { ...snapshot, connected: state.isWebSocketConnected };
    emit();
  });
  async function execute(c: Command) {
    if (c.kind === "login") {
      const credentials = { email: "admin@welist.local", password: c.password };
      try {
        await auth.signIn("password", { ...credentials, flow: "signIn" });
      } catch {
        throw Error(
          "No se pudo iniciar sesión. Comprueba la contraseña y tu conexión.",
        );
      }
      return "Verificando acceso a la cabina…";
    }
    if (c.kind === "logout") {
      await auth.signOut();
      admin = false;
      authenticated = false;
      snapshot = { ...snapshot, admin: false, authError: null, metrics: null };
      watch();
      emit();
      return "Sesión cerrada.";
    }
    if (c.kind === "start") {
      await mutation("admin:start", {
        name: c.name,
        profiles: c.profiles,
      });
      return "Evento iniciado.";
    }
    if (c.kind === "end") {
      await mutation("admin:end", { eventId: c.eventId });
      return "Evento terminado.";
    }
    if (c.kind === "archive") {
      const request = snapshot.event?.tracks.find((t) => t.id === c.trackId);
      if (!request?.requestId) throw Error("Canción no encontrada.");
      await mutation("admin:archive", {
        eventId: c.eventId,
        requestId: request.requestId,
        undo: c.undo,
      });
      return "Listo.";
    }
    await ensureGuest();
    let result;
    try {
      result = await mutation(
        c.kind === "gate" ? "guest:gate" : "guest:requestOrVote",
        c.kind === "gate"
          ? {
              token,
              eventId: c.eventId,
              profile: c.profile,
              confirm: c.confirm,
            }
          : { token, eventId: c.eventId, trackId: c.trackId },
      );
    } catch (error) {
      const data = (error as { data?: unknown })?.data;
      if (typeof data === "string" && messages[data])
        throw new CommandError(data, messages[data]);
      throw error;
    }
    if (result !== "OK")
      throw new CommandError(result, messages[result] || result);
    return c.kind === "vote" ? "¡Tu voto ya cuenta!" : "Listo.";
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    execute,
    getParticipation: async (eventId) => {
      if (!token)
        throw Error("No se pudo comprobar la sesión. Vuelve a intentarlo.");
      const participation = await new ConvexHttpClient(url).query(
        makeFunctionReference<"query">("guest:participation"),
        { eventId, token },
      );
      return {
        ...participation,
        votedTracks: (participation.votedTracks ?? []).map(track),
      };
    },
    setAuthState: (value, loading) => {
      snapshot = { ...snapshot, authLoading: loading || (value && !admin) };
      if (loading) {
        if (admin || authenticated) {
          admin = false;
          authenticated = false;
          snapshot = { ...snapshot, admin: false, metrics: null };
          watch();
        }
        emit();
        return;
      }
      if (value === authenticated) {
        emit();
        return;
      }
      authenticated = value;
      if (!value) {
        admin = false;
        snapshot = {
          ...snapshot,
          admin: false,
          authError: null,
          metrics: null,
        };
      }
      watch();
      emit();
    },
    search: async (eventId, term, force = false) => {
      await ensureGuest();
      const result = await client.action(
        makeFunctionReference<"action">("services:search"),
        { token, eventId, term, force },
      );
      return {
        tracks: (result.tracks ?? []).map(track),
        error: result.error
          ? messages[result.error] || "Error de búsqueda."
          : undefined,
      };
    },
    loadMore: (limit) => {
      visibleLimit = Math.min(1000, limit);
      watch();
    },
    dispose: () => {
      unsubscribe();
      connection();
      children.forEach((fn) => fn());
      void client.close();
    },
  };
}
