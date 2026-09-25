import "../../styling/hero.css";

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
        <img
          src={selectedPlaylist.cover}
          alt={selectedPlaylist.name || "Playlist"}
        />
      </div>

      <div className="playlist-hero-details">
        <span className="playlist-status">
          {selectedPlaylist.status === "private"
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
            {trackCount} {trackCount === 1 ? "song" : "songs"}
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