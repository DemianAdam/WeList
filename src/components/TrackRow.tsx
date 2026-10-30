import type { Track } from "../data/types";
export function TrackRow({
  track,
  index,
  voted,
  disabled,
  pending,
  onClick,
  booth = false,
}: {
  track: Track;
  index: number;
  voted?: boolean;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
  booth?: boolean;
}) {
  return (
    <article className="track">
      <span className="rank">{String(index + 1).padStart(2, "0")}</span>
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
        aria-label={booth ? "Quitar " + track.title : "Votar " + track.title}
        disabled={disabled || pending}
        onClick={onClick}
      >
        {pending
          ? "…"
          : booth
            ? "Quitar"
            : `${voted ? "✓" : "↑"} ${track.votes}`}
      </button>
    </article>
  );
}
