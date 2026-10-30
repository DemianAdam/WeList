import type { Track } from "../data/types";
export function TrackRow({
  track,
  index,
  voted,
  disabled,
  pending,
  onClick,
  booth = false,
  ranked = false,
}: {
  track: Track;
  index: number;
  voted?: boolean;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
  booth?: boolean;
  ranked?: boolean;
}) {
  return (
    <article className="track">
      {(booth || ranked) && (
        <span className="rank">{String(index + 1).padStart(2, "0")}</span>
      )}
      {!booth &&
        (track.artwork ? (
          <img
            className="cover"
            src={track.artwork}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
        ) : (
          <div className={"cover c" + (index % 4)} aria-hidden="true">
            ♫
          </div>
        ))}
      <div className="track-info">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
        {track.url && (
          <a
            className="spotify"
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Escuchar en Spotify ↗
          </a>
        )}
      </div>
      <button
        className={!booth && voted ? "vote-button voted" : !booth ? "vote-button" : undefined}
        aria-label={booth ? "Quitar " + track.title : "Votar " + track.title}
        disabled={disabled || pending}
        onClick={onClick}
      >
        {pending ? (
          "…"
        ) : booth ? (
          "Quitar"
        ) : (
          <>
            <span>{voted ? "✓ Votada" : "Votar"}</span>
            <small>
              {track.votes} {track.votes === 1 ? "voto" : "votos"}
            </small>
          </>
        )}
      </button>
    </article>
  );
}
