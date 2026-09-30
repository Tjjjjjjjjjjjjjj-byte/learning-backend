import { getImageUrl } from "../utils/imageUrl";
import { useSpotifyGate } from "../utils/spotifyGate.js";

const TYPE_LABELS = {
  track: "Song",
  artist: "Artist",
  album: "Album",
  playlist: "Playlist",
};

function TopResultCard({
  item,
  type,
  subtitle,
  cover,
  isCurrentTrack,
  isPlaying,
  onOpen,
}) {
  const gate = useSpotifyGate();
  const isWaitingForSpotify = type === "track" && gate.pendingTrackId === item.id;

  const resolvedCover = getImageUrl(cover);

  return (
    <div
      className={`top-result-card${type === "artist" ? " top-result-artist" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="top-result-cover">
        {resolvedCover ? (
          <img src={resolvedCover} alt={item.name} />
        ) : (
          <div className="top-result-cover-placeholder" aria-hidden="true" />
        )}
      </div>

      <div className="top-result-info">
        <h2>{item.name}</h2>

        <p>
          {TYPE_LABELS[type] || "Result"}
          {subtitle ? ` • ${subtitle}` : ""}
        </p>
      </div>

      <button
        type="button"
        className={`top-result-play${isWaitingForSpotify ? " waiting" : ""}`}
        title={
          isWaitingForSpotify
            ? `Spotify is rate limited - starting in ~${gate.retryAfterSeconds}s`
            : undefined
        }
        onClick={(event) => {
          event.stopPropagation();
          if (isWaitingForSpotify) return;
          onOpen();
        }}
      >
        <span className="material-symbols-outlined">
          {isWaitingForSpotify
            ? "progress_activity"
            : type === "track" && isCurrentTrack && isPlaying
              ? "pause"
              : "play_arrow"}
        </span>
      </button>
    </div>
  );
}

export default TopResultCard;
