import { useSongSearch } from "../hooks/useSongSearch";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useData, isDemo } from "../data/context";
import { Modal } from "../components/Modal";
import { TrackRow } from "../components/TrackRow";
import { CommandError, type Track } from "../data/types";
type PendingVote = {
  eventId: string;
  trackId: string;
  title: string;
  artist: string;
  phase: "gate" | "uncertain" | "retry";
};
const PENDING_KEY = "welist-pending-vote";
function readPending(): PendingVote | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
    if (
      !value ||
      typeof value.eventId !== "string" ||
      typeof value.trackId !== "string" ||
      typeof value.title !== "string" ||
      typeof value.artist !== "string" ||
      !["gate", "uncertain", "retry"].includes(value.phase)
    )
      return null;
    return {
      ...value,
      phase: value.phase === "retry" ? "uncertain" : value.phase,
    };
  } catch {
    return null;
  }
}
export function Guest() {
  const {
    event,
    participation: p,
    execute,
    getParticipation,
    localSearch,
    search,
    connected,
    loading,
    loadMore,
  } = useData();
  const [query, setQuery] = useState("");
  const [expandedSearch, setExpandedSearch] = useState("");

  const [pending, setPending] = useState<PendingVote | null>(readPending);
  const pendingRef = useRef(pending);
  const currentEvent = useRef(event);
  useLayoutEffect(() => {
    currentEvent.current = event;
  }, [event]);
  const submitting = useRef(false);
  const [gateError, setGateError] = useState("");
  const [failedProfiles, setFailedProfiles] = useState<number[]>([]);
  const [profileBusy, setProfileBusy] = useState<number[]>([]);
  const profileInFlight = useRef(new Set<number>());
  function savePending(value: PendingVote | null) {
    pendingRef.current = value;
    setPending(value);
    try {
      if (value) sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* The current tab can still complete the vote. */
    }
  }
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const [limit, setLimit] = useState(50);
  const [ack, setAck] = useState<string | null>(null);

  const seen = useRef<string | null>(null);
  const id = event?.id;
  const active =
    event?.tracks
      .filter((t) => !t.archived)
      .sort((a, b) => b.votes - a.votes) || [];
  const q = query.trim().toLocaleLowerCase();
  const local = active.filter((t) =>
    (t.title + " " + t.artist).toLocaleLowerCase().includes(q),
  );
  const searchKey = JSON.stringify([id, q]);
  const needsSearch = !!id && q.length >= 2;
  const forceSearch = expandedSearch === searchKey;
  useEffect(() => {
    if (id && q) loadMore?.(1000);
  }, [id, q, loadMore]);
  useEffect(() => {
    if (id && seen.current === null) {
      seen.current = id;
      setAck(id);
    }
    if (id !== seen.current) {
      setQuery("");
      setMessage("");
    }
  }, [id]);
  useEffect(() => {
    if (loading || !pending) return;
    if (!event?.live || pending.eventId !== event.id) {
      savePending(null);
      setGateError("");
      setMessage("El evento terminó o cambió. Tu voto pendiente se canceló.");
    }
  }, [loading, event?.id, event?.live, pending]);
  useEffect(() => {
    if (
      pending &&
      pending.phase !== "gate" &&
      pending.eventId === event?.id &&
      p.votes.includes(pending.trackId)
    ) {
      savePending(null);
      setGateError("");
      setMessage("¡Tu voto ya cuenta!");
    }
  }, [pending, event?.id, p.votes]);
  const { results, searchError, searching, retrySearch } = useSongSearch(
    id,
    q,
    needsSearch,
    forceSearch,
    localSearch,
    search,
  );
  async function submit(track: Track) {
    if (!event || ack !== event.id) return;
    if (!p.unlocked) {
      savePending({
        eventId: event.id,
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        phase: "gate",
      });
      setGateError("");
      setFailedProfiles([]);
      return;
    }
    setBusy(track.id);
    try {
      setMessage(
        await execute({ kind: "vote", eventId: event.id, trackId: track.id }),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo votar.");
    } finally {
      setBusy("");
    }
  }
  async function profile(index: number) {
    if (!event || profileInFlight.current.has(index)) return;
    profileInFlight.current.add(index);
    const eventId = event.id;
    const trackId = pendingRef.current?.trackId;
    setProfileBusy((items) => [...new Set([...items, index])]);
    setFailedProfiles((items) => items.filter((i) => i !== index));
    try {
      await execute({
        kind: "gate",
        eventId,
        profile: index,
        confirm: false,
      });
    } catch {
      if (
        currentEvent.current?.id === eventId &&
        pendingRef.current?.eventId === eventId &&
        pendingRef.current?.trackId === trackId
      )
        setFailedProfiles((items) => [...new Set([...items, index])]);
    } finally {
      profileInFlight.current.delete(index);
      setProfileBusy((items) => items.filter((i) => i !== index));
    }
  }
  function isCurrent(selection: PendingVote) {
    return (
      pendingRef.current?.eventId === selection.eventId &&
      pendingRef.current?.trackId === selection.trackId &&
      currentEvent.current?.id === selection.eventId &&
      currentEvent.current.live
    );
  }
  async function submitPending(selection: PendingVote) {
    if (!isCurrent(selection)) return;
    savePending({ ...selection, phase: "uncertain" });
    try {
      const result = await execute({
        kind: "vote",
        eventId: selection.eventId,
        trackId: selection.trackId,
      });
      if (!isCurrent(selection)) return;
      savePending(null);
      setGateError("");
      setMessage(result);
    } catch (e) {
      if (!isCurrent(selection)) return;
      if (e instanceof CommandError && e.code === "DUPLICATE") {
        savePending(null);
        setMessage("Ya votaste esta canción.");
      } else if (
        e instanceof CommandError &&
        [
          "ARCHIVED",
          "INVALID_TRACK",
          "EXHAUSTED",
          "EVENT_CLOSED",
          "SESSION_EXPIRED",
        ].includes(e.code)
      ) {
        savePending(null);
        setMessage(e.message);
      } else {
        setGateError(
          "No pudimos confirmar si se registró tu voto. Compruébalo antes de volver a intentarlo.",
        );
      }
    }
  }
  async function unlock() {
    const selection = pendingRef.current;
    if (!selection || submitting.current || !isCurrent(selection)) return;
    submitting.current = true;
    setBusy("gate");
    setGateError("");
    try {
      if (selection.phase === "gate")
        await execute({
          kind: "gate",
          eventId: selection.eventId,
          confirm: true,
        });
      await submitPending(selection);
    } catch (e) {
      if (isCurrent(selection))
        setGateError(e instanceof Error ? e.message : "Inténtalo nuevamente.");
    } finally {
      submitting.current = false;
      setBusy("");
    }
  }
  async function reconcile() {
    const selection = pendingRef.current;
    if (!selection || submitting.current || !isCurrent(selection)) return;
    submitting.current = true;
    setBusy("gate");
    setGateError("");
    try {
      const participation = await getParticipation(selection.eventId);
      if (!isCurrent(selection)) return;
      if (participation.votes.includes(selection.trackId)) {
        savePending(null);
        setMessage("¡Tu voto ya cuenta!");
      } else if (participation.votes.length >= 3) {
        savePending(null);
        setMessage("Ya usaste tus tres votos.");
      } else {
        savePending({ ...selection, phase: "retry" });
        setGateError("El voto aún no aparece. Puedes volver a intentarlo.");
      }
    } catch (e) {
      if (isCurrent(selection))
        setGateError(
          e instanceof Error
            ? e.message
            : "No se pudo comprobar el voto. Inténtalo nuevamente.",
        );
    } finally {
      submitting.current = false;
      setBusy("");
    }
  }
  if (loading)
    return (
      <div className="empty" role="status">
        Conectando con la noche…
      </div>
    );
  const ids = new Set(local.map((track) => track.id));
  const rows = q
    ? [...local, ...results.filter((track) => !ids.has(track.id))]
    : active;
  return (
    <div className="guest">
      <section className="guest-intro">
        <span className="guest-kicker">TU NOCHE · TU MÚSICA</span>
        <h1>{event?.live ? event.name : "Nos vemos en la próxima noche."}</h1>
      </section>
      {event?.live ? (
        <>
          <details className="my-votes">
            <summary>
              <strong>Te quedan {3 - p.votes.length} de 3 votos</strong>
              <span>
                Ver tus votos <span aria-hidden="true">⌄</span>
              </span>
            </summary>
            <section aria-label="Tus votos">
              <p className="hint">
                Los votos son permanentes y no se pueden recuperar.
              </p>
              {p.votes.length === 0 ? (
                <p className="hint">Tus canciones elegidas aparecerán aquí.</p>
              ) : (
                <ul className="my-votes-list">
                  {p.votedTracks.map((track) => (
                    <li key={track.id}>
                      <div>
                        <strong>{track.title}</strong>
                        <span>{track.artist}</span>
                      </div>
                      <span
                        className={
                          track.archived ? "vote-status removed" : "vote-status"
                        }
                      >
                        {track.archived
                          ? "Retirada por el DJ · Voto utilizado"
                          : "✓ Voto registrado"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </details>
          <label className="search-label" htmlFor="guest-search">
            Busca una canción o artista
          </label>
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              id="guest-search"
              maxLength={100}
              aria-label="Buscar canción o artista"
              placeholder="Busca una canción o artista…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(50);
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </label>
          <section>
            <div className="section-title">
              <h2>{q ? "Resultados" : "Ranking de canciones"}</h2>
              <span>{active.length} CANCIONES</span>
            </div>
            {q && local.length > 0 && (
              <p className="hint">Ya está en la pista · Suma tu voto</p>
            )}
            {q.length >= 2 && !forceSearch && (
              <button onClick={() => setExpandedSearch(searchKey)}>
                Buscar más canciones
              </button>
            )}
            {searching && <p role="status">Buscando canciones…</p>}
            {searchError && (
              <div className="notice">
                {searchError}
                <button onClick={retrySearch}>Reintentar</button>
              </div>
            )}
            {rows.slice(0, limit).map((track, index) => (
              <TrackRow
                key={track.id}
                {...{ track, index }}
                ranked={!q}
                voted={p.votes.includes(track.id)}
                disabled={
                  !connected ||
                  !!busy ||
                  p.votes.includes(track.id) ||
                  p.votes.length >= 3 ||
                  ack !== event.id
                }
                pending={busy === track.id}
                onClick={() => void submit(track)}
              />
            ))}
            {!searching && !rows.length && !searchError && (
              <div className="empty">
                {q
                  ? "No encontramos esa canción. Prueba otro título o artista."
                  : "La pista espera tu primera canción."}
              </div>
            )}
            {rows.length >= limit && limit < 1000 && (
              <button
                onClick={() => {
                  setLimit(limit + 50);
                  loadMore?.(limit + 50);
                }}
              >
                Cargar más
              </button>
            )}
            {q && local.length === 0 && isDemo && (
              <p className="hint">
                Catálogo de demostración · Sin llamadas a Spotify.
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="empty">
          No hay un evento activo. Conserva este enlace para la próxima fecha.
        </div>
      )}
      {pending &&
        event?.live &&
        pending.eventId === event.id &&
        ack === event.id && (
          <Modal
            title="Conecta con la noche"
            onClose={() => {
              if (!submitting.current) {
                savePending(null);
                setGateError("");
                setFailedProfiles([]);
              }
            }}
          >
            <div className="eyebrow">CONECTA CON LA NOCHE</div>
            <h2>
              {event.profiles.length === 1 ? "Un perfil." : "Dos perfiles."}
              <br />
              Tres oportunidades.
            </h2>
            <p>
              Visita{" "}
              {event.profiles.length === 1 ? "el perfil" : "ambos perfiles"} y
              vuelve para participar.
            </p>
            <p>
              Tu voto: <strong>{pending.title}</strong> — {pending.artist}
            </p>
            {event.profiles.map((handle, index) => (
              <div key={handle}>
                <a
                  className="profile"
                  href={"https://www.instagram.com/" + handle + "/"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void profile(index)}
                >
                  @{handle}
                  <span>{p.clicks.includes(index) ? "✓" : "↗"}</span>
                </a>
                {failedProfiles.includes(index) && (
                  <p role="alert">
                    No se pudo registrar la visita. Vuelve a tocar @{handle}{" "}
                    para intentarlo nuevamente.
                  </p>
                )}
              </div>
            ))}
            {gateError && <p role="alert">{gateError}</p>}
            {pending.phase === "uncertain" ? (
              <button
                className="primary"
                disabled={!!busy || !connected}
                onClick={() => void reconcile()}
              >
                Comprobar voto
              </button>
            ) : (
              <button
                className="primary"
                disabled={
                  (pending.phase === "gate" &&
                    p.clicks.length !== event.profiles.length) ||
                  !!busy ||
                  profileBusy.length > 0 ||
                  !connected
                }
                onClick={() => void unlock()}
              >
                {busy
                  ? "Registrando…"
                  : pending.phase === "retry"
                    ? "Reintentar voto"
                    : "Continuar"}
              </button>
            )}
            <small>
              No verificamos si sigues los perfiles. Al continuar, se enviará tu
              voto.
            </small>
          </Modal>
        )}
      {event?.live && ack !== null && ack !== event.id && (
        <Modal title="Nuevo evento">
          <h2>Comienza una nueva noche.</h2>
          <p>{event.name}. Tienes tres nuevos votos.</p>
          <button
            className="primary"
            onClick={() => {
              setAck(event.id);
              seen.current = event.id;
            }}
          >
            Entrar al evento
          </button>
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          {message}
          <button onClick={() => setMessage("")} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
