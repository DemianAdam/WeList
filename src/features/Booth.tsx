import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useData, isDemo } from "../data/context";
import type { Command } from "../data/types";
import { Modal } from "../components/Modal";
import { TrackRow } from "../components/TrackRow";
export function Booth() {
  const { event, admin, authLoading, authError, metrics, execute, connected } =
    useData();
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [profiles, setProfiles] = useState(["", ""]);
  const [preview, setPreview] = useState(false);
  const [ending, setEnding] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ eventId: string; trackId: string } | null>(
    null,
  );
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(timer);
  }, [undo]);
  async function run(command: Command) {
    setBusy(true);
    try {
      const result = await execute(command);
      setMessage(result);
      return true;
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo completar la acción.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const active =
    event?.tracks
      .filter((t) => !t.archived)
      .sort((a, b) => b.votes - a.votes) || [];
  function download() {
    const svg = document.querySelector("#venue-qr");
    if (!svg) return;
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "welist-qr.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const joinUrl = import.meta.env.VITE_PUBLIC_URL || location.origin;
  return (
    <>
      {authLoading ? (
        <div className="empty" role="status">
          Comprobando sesión…
        </div>
      ) : !admin ? (
        <section className="panel">
          <div className="eyebrow">SOLO PARA QUIEN LLEVA LA NOCHE</div>
          <h1>Cabina DJ</h1>
          {authError && <p role="alert">{authError}</p>}
          {isDemo && (
            <p>
              Demo local: contraseña <code>welist-demo</code>.
            </p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run({ kind: "login", password })) setPassword("");
            }}
          >
            <label>
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Entrar a la cabina
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="section-title">
            <h1>Tu cabina.</h1>
            <button
              disabled={busy}
              onClick={() => void run({ kind: "logout" })}
            >
              Salir
            </button>
          </div>
          {event?.live ? (
            <>
              <div className="budget">
                <strong>{event.name}</strong>
                <span>
                  {event.tracks.reduce((n, t) => n + t.votes, 0)} votos ·{" "}
                  {event.tracks.length} canciones
                </span>
              </div>
              {active.length === 0 && (
                <div className="empty">
                  Todo listo. Las canciones aparecerán aquí.
                </div>
              )}
              {active.map((track, index) => (
                <TrackRow
                  key={track.id}
                  {...{ track, index }}
                  booth
                  disabled={busy || !connected}
                  onClick={async () => {
                    if (
                      await run({
                        kind: "archive",
                        eventId: event.id,
                        trackId: track.id,
                        undo: false,
                      })
                    )
                      setUndo({ eventId: event.id, trackId: track.id });
                  }}
                />
              ))}
              <details>
                <summary>
                  Canciones retiradas (
                  {event.tracks.filter((t) => t.archived).length})
                </summary>
                {event.tracks
                  .filter((t) => t.archived)
                  .map((t) => (
                    <p key={t.id}>
                      {t.title} — {t.artist} · {t.votes} votos
                    </p>
                  ))}
              </details>
              {undo && undo.eventId === event.id && (
                <div className="notice">
                  Canción retirada
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await run({ kind: "archive", ...undo, undo: true });
                      setUndo(null);
                    }}
                  >
                    Deshacer
                  </button>
                </div>
              )}
              <button
                className="danger"
                disabled={busy || !connected}
                onClick={() => setEnding(true)}
              >
                Terminar evento
              </button>
            </>
          ) : (
            <section className="panel">
              <h2>Prepara la próxima noche</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const normalizedProfiles = profiles
                    .map((profile) =>
                      profile.trim().replace(/^@/, "").toLowerCase(),
                    )
                    .filter(Boolean);
                  if (normalizedProfiles.length === 0) {
                    setMessage("Elige al menos un perfil.");
                    return;
                  }
                  if (
                    normalizedProfiles.length === 2 &&
                    normalizedProfiles[0] === normalizedProfiles[1]
                  ) {
                    setMessage("Elige dos perfiles diferentes.");
                    return;
                  }
                  if (!preview) {
                    setPreview(true);
                    return;
                  }
                  if (
                    await run({
                      kind: "start",
                      name,
                      profiles: normalizedProfiles,
                    })
                  ) {
                    setPreview(false);
                    setName("");
                    setProfiles(["", ""]);
                  }
                }}
              >
                <label>
                  Nombre del evento
                  <input
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setPreview(false);
                    }}
                  />
                </label>
                {profiles.map((p, i) => (
                  <label key={i}>
                    Perfil de Instagram {i + 1}
                    {i === 0 ? " (obligatorio)" : " (opcional)"}
                    <input
                      required={i === 0}
                      pattern="[A-Za-z0-9._]{1,30}"
                      placeholder="usuario, sin @"
                      value={p}
                      onChange={(e) => {
                        setProfiles(
                          profiles.map((x, j) =>
                            j === i ? e.target.value : x,
                          ),
                        );
                        setPreview(false);
                      }}
                    />
                  </label>
                ))}
                {preview && (
                  <div className="notice">
                    {name} ·{" "}
                    {profiles
                      .filter(Boolean)
                      .map((profile) => `@${profile}`)
                      .join(" + ")}{" "}
                    · Los perfiles no se podrán modificar.
                  </div>
                )}
                <button disabled={busy || !connected} className="primary">
                  {preview ? "Iniciar evento" : "Revisar evento"}
                </button>
              </form>
            </section>
          )}
          {metrics && (
            <section className="panel">
              <h2>Así se mueve la noche</h2>
              <div className="metrics">
                <div>
                  <strong>{metrics.participants}</strong>
                  <span>Navegadores participantes</span>
                </div>
                <div>
                  <strong>{metrics.profileClicks.join(" / ")}</strong>
                  <span>
                    Visitas iniciadas · perfil 1
                    {event?.profiles.length === 2 ? " / 2" : ""}
                  </span>
                </div>
                <div>
                  <strong>{metrics.unlocked}</strong>
                  <span>Accesos completados</span>
                </div>
                <div>
                  <strong>{metrics.exhausted}</strong>
                  <span>Usaron los tres votos</span>
                </div>
                <div>
                  <strong>{metrics.votes}</strong>
                  <span>Votos de participantes</span>
                </div>
                <div>
                  <strong>{metrics.requests}</strong>
                  <span>Canciones solicitadas</span>
                </div>
              </div>
              <p className="hint">
                Las visitas no son seguidores verificados. Los navegadores no
                equivalen a personas únicas.
                {isDemo ? " Los votos iniciales son de ejemplo." : ""}
              </p>
            </section>
          )}
          <section className="panel qr">
            <div>
              <h2>Una puerta a cada noche.</h2>
              <p>El mismo QR, siempre el evento actual.</p>
              <a href={joinUrl}>{joinUrl}</a>
              <button onClick={download}>Descargar QR</button>
            </div>
            <QRCodeSVG
              id="venue-qr"
              value={joinUrl}
              size={150}
              marginSize={4}
            />
          </section>
        </>
      )}
      {ending && event && (
        <Modal title="Terminar evento" onClose={() => setEnding(false)}>
          <h2>¿Terminamos la noche?</h2>
          <p>
            Se cerrarán los pedidos y votos. El historial se conservará durante
            30 días.
          </p>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (await run({ kind: "end", eventId: event.id })) {
                setEnding(false);
                setUndo(null);
              }
            }}
          >
            Sí, terminar evento
          </button>
          <button onClick={() => setEnding(false)}>Seguir con la noche</button>
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          {message}
          <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
