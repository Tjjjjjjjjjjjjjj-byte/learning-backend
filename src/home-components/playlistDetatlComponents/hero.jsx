import "../../styling/hero.css";
import { getImageUrl } from "../../utils/imageUrl";
import { formatRelativeDate } from "../../utils/dateUtils.js";

function Hero({
  selectedPlaylist,
  trackCount,
  totalMinutes,
  totalSeconds,
}) {
  const formattedSeconds = totalSeconds
    .toString()
    .padStart(2, "0");

  return (
    <section className="playlist-hero">
      <div className="playlist-hero-cover">
        {getImageUrl(selectedPlaylist.cover) ? (
          <img
            src={getImageUrl(selectedPlaylist.cover)}
            alt={selectedPlaylist.name || "Playlist"}
          />
        ) : (
          <div className="playlist-cover-placeholder" aria-hidden="true" />
        )}
      </div>

      <div className="playlist-hero-details">
        <span className="playlist-status">
          {selectedPlaylist.type === "spotify-public"
            ? "Spotify Public Playlist"
            : selectedPlaylist.status === "private"
              ? "Private Playlist"
              : "Public Playlist"}
        </span>

        <h1>
          {selectedPlaylist.name || "My Playlist"}
        </h1>

        {selectedPlaylist.description && (
          <p className="playlist-description">
            {selectedPlaylist.description}
          </p>
        )}

        <div className="playlist-meta">
          <strong>{selectedPlaylist.owner}</strong>

          <span>•</span>

          <span>
            {trackCount == null
            ? "Song count unavailable"
            : `${trackCount} ${trackCount === 1 ? "song" : "songs"}`}
          </span>

          <span>•</span>

          <span>
            Created {formatRelativeDate(selectedPlaylist.createdAt)}
          </span>

          {trackCount > 0 && (
            <>
              <span>•</span>

              <span>
                {totalMinutes} min {formattedSeconds} sec
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default Hero;