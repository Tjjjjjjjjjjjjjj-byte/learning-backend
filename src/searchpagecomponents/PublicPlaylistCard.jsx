import { getImageUrl } from "../utils/imageUrl";

function PublicPlaylistCard({ playlist, saved, onOpen, onSave, saving }) {
  return (
    <article
      className="search-result-card public-playlist-result clickable-search-result"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="search-result-cover">
        {getImageUrl(playlist.cover) ? (
        <img
          src={getImageUrl(playlist.cover)}
          alt={playlist.name || "Spotify playlist"}
        />
      ) : (
        <div className="search-result-cover-placeholder" aria-hidden="true" />
      )}
      </div>

      <div className="search-result-info">
        <span className="public-playlist-label">Spotify Public Playlist</span>
        <h3>{playlist.name || "Spotify Playlist"}</h3>
        <p>
          {playlist.owner || "Spotify"} · {
            playlist.itemsStatus === "unavailable"
              ? "songs unavailable to this API client"
              : playlist.trackCount === 0
                ? "0 songs"
                : playlist.trackCount != null
                  ? `${playlist.trackCount} songs`
                  : "song count unavailable"
          }
        </p>
        {playlist.description && (
          <p>{playlist.description}</p>
        )}
      </div>

      <button
        type="button"
        className={`public-playlist-save${saved ? " saved" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onSave();
        }}
        disabled={saving}
        title={saved ? "Saved to your library" : "Save to your library"}
      >
        <span className="material-symbols-outlined">
          {saved ? "bookmark" : "bookmark_add"}
        </span>
      </button>
    </article>
  );
}

export default PublicPlaylistCard;
