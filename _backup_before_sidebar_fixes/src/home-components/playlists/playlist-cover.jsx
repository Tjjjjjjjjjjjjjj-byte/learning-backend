import { getImageUrl } from "../../utils/imageUrl";

function PlaylistCover({ cover, isCurrent, isPlaying, onTogglePlay }) {
  return (
    <>
      {getImageUrl(cover) ? (
        <img src={getImageUrl(cover)} alt="Playlist cover" />
      ) : (
        <div className="playlist-cover-placeholder" aria-hidden="true" />
      )}

      <span
        className={isCurrent ? "play-icon active" : "play-icon"}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay?.(e);
        }}
      >
        <span className="material-symbols-outlined">
          {isPlaying ? "pause" : "play_arrow"}
        </span>
      </span>
    </>
  );
}

export default PlaylistCover;
