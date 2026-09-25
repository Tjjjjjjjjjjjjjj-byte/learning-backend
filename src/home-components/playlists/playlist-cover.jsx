function PlaylistCover({ cover, isCurrent, isPlaying, onTogglePlay }) {
  return (
    <>
      <img src={cover} alt="Playlist cover" />

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
