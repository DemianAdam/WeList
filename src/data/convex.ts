import type { Result } from "../../convex/contracts/results";
import type { SearchResult as BackendSearchResult } from "../../convex/contracts/music";
import type { RegisterSessionResult } from "../../convex/contracts/commands";
import type { Id } from "../../convex/_generated/dataModel";
import type { FunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import type {
  Adapter,
  Command,
  ConvexAuthBridge,
  Snapshot,
  Track,
} from "./types";
import { CommandError, emptyParticipation } from "./types";
import { createGuestSession } from "./guestSession";
import { applicationCode } from "../../shared/session-diagnostics.mjs";
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
  QUOTA_EXCEEDED:
    "La búsqueda de Spotify alcanzó su límite. Puedes votar canciones disponibles.",
};
export function createConvexAdapter(
  url: string,
  auth: ConvexAuthBridge,
  connectedClient?: unknown,
): Adapter {
  const client: any = connectedClient ?? new ConvexClient(url);
  let disposed = false;
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
  let expirationVersion = 0;
  const guest = createGuestSession({
    url,
    register: async (args) => {
      const result: RegisterSessionResult = await client.mutation(
        api.sessions.mutations.registerSession,
        args,
      );
      return result.ok
        ? { status: "OK", reused: result.data.reused }
        : {
            status: result.error.code,
            retryAfterMs: result.error.retryAfterMs ?? 1,
          };
    },
    onExpire: () => {
      token = "";
      snapshot = {
        ...snapshot,
        participation: emptyParticipation,
        sessionExpired: ++expirationVersion,
      };
      emit();
      queueMicrotask(watch);
    },
  });
  let token = guest.getToken();
  let admin = false;
  let authenticated = false;
  let eventId = "";
  let visibleLimit = 50;
  async function ensureGuest() {
    await guest.ensure();
    if (token !== guest.getToken()) {
      token = guest.getToken();
      snapshot = { ...snapshot, sessionExpired: 0 };
      watch();
      emit();
    }
  }
  let snapshot: Snapshot = {
    event: null,
    participation: emptyParticipation,
    admin: false,
    authLoading: true,
    authError: null,
    providerQuota: "ok",
    metrics: null,
    connected: true,
    loading: true,
  };
  const listeners = new Set<() => void>();
  let children: (() => void)[] = [];
  const emit = () => listeners.forEach((fn) => fn());
  const mutation = (
    name: FunctionReference<"mutation">,
    args: Record<string, unknown>,
  ): Promise<Result<unknown, string>> => client.mutation(name, args);
  async function adminMutation(
    name: FunctionReference<"mutation">,
    args: Record<string, unknown>,
  ) {
    try {
      const result = await mutation(name, args);
      if (!result.ok)
        throw new CommandError(
          result.error.code,
          messages[result.error.code] ?? result.error.code,
        );
    } catch (error) {
      const code = applicationCode(error);
      if (code) throw new CommandError(code, messages[code] ?? code);
      throw error;
    }
  }
  function guestError(error: unknown, usedToken: string) {
    const code = applicationCode(error);
    if (code === "SESSION_EXPIRED") guest.invalidate(usedToken);
    return code && messages[code]
      ? new CommandError(code, messages[code])
      : new Error("No pudimos conectar. Vuelve a intentarlo.");
  }
  async function guestAction(
    name: FunctionReference<"action">,
    args: Record<string, unknown>,
  ): Promise<BackendSearchResult> {
    try {
      return await client.action(name, args);
    } catch (error) {
      throw guestError(error, String(args.token ?? ""));
    }
  }
  type RawTrack = {
    trackId: string;
    _id?: string;
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
    if (disposed) return;
    children.forEach((fn) => fn());
    children = [];
    if (eventId && !admin)
      children.push(
        client.onUpdate(
          api.requests.queries.leaderboard,
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
    if (token && eventId) {
      const watchedToken = token;
      children.push(
        client.onUpdate(
          api.participation.queries.participation,
          { eventId, token: watchedToken },
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
          (error: Error) => {
            if (applicationCode(error) === "SESSION_EXPIRED")
              guest.invalidate(watchedToken);
          },
        ),
      );
    }
    if (authenticated)
      children.push(
        client.onUpdate(
          api.music.spotify.queries.providerStatus,
          {},
          (status: Snapshot["providerQuota"]) => {
            snapshot = { ...snapshot, providerQuota: status };
            emit();
          },
          () => {
            snapshot = { ...snapshot, providerQuota: "ok" };
            emit();
          },
        ),
      );
    if (authenticated)
      children.push(
        client.onUpdate(
          api.events.queries.dashboard,
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
    api.events.queries.currentEvent,
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
      await adminMutation(api.events.mutations.startEvent, {
        name: c.name,
        profiles: c.profiles,
      });
      return "Evento iniciado.";
    }
    if (c.kind === "retryProvider") {
      await adminMutation(api.music.spotify.mutations.retryProvider, {});
      return "Se comprobará Spotify en la próxima búsqueda.";
    }
    if (c.kind === "end") {
      await adminMutation(api.events.mutations.endEvent, {
        eventId: c.eventId,
      });
      return "Evento terminado.";
    }
    if (c.kind === "archive") {
      const request = snapshot.event?.tracks.find((t) => t.id === c.trackId);
      if (!request?.requestId) throw Error("Canción no encontrada.");
      await adminMutation(api.requests.mutations.setArchived, {
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
        c.kind === "gate"
          ? api.participation.mutations.updateGate
          : api.requests.mutations.requestOrVote,
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
      throw guestError(error, token);
    }
    if (!result.ok)
      throw new CommandError(
        result.error.code,
        messages[result.error.code] || result.error.code,
      );
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
      let participation;
      const checkedToken = token;
      try {
        participation = await new ConvexHttpClient(url).query(
          api.participation.queries.participation,
          { eventId: eventId as Id<"events">, token: checkedToken },
        );
      } catch (error) {
        throw guestError(error, checkedToken);
      }
      return {
        ...participation,
        votedTracks: (participation.votedTracks ?? []).map(track),
      };
    },
    localSearch: async (eventId, term) => {
      await ensureGuest();
      const result = await guestAction(api.music.search.actions.localSearch, {
        token,
        eventId,
        term,
      });
      return {
        tracks: (result.ok ? result.data.tracks : []).map(track),
        error: (!result.ok ? result.error.code : result.data.warning?.code)
          ? messages[
              !result.ok ? result.error.code : result.data.warning!.code
            ] || "Error de búsqueda."
          : undefined,
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
      const result = await guestAction(api.music.search.actions.search, {
        token,
        eventId,
        term,
        force,
      });
      return {
        tracks: (result.ok ? result.data.tracks : []).map(track),
        error: (!result.ok ? result.error.code : result.data.warning?.code)
          ? messages[
              !result.ok ? result.error.code : result.data.warning!.code
            ] || "Error de búsqueda."
          : undefined,
      };
    },
    loadMore: (limit) => {
      visibleLimit = Math.min(1000, limit);
      watch();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      guest.dispose();
      unsubscribe();
      connection();
      children.forEach((fn) => fn());
      void client.close();
    },
  };
}
