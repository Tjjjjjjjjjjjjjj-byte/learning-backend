import { getImageUrl } from "../../utils/imageUrl";

function PlaylistCover({
  cover,
  isCurrent,
  isPlaying,
  isLoading = false,
  loadingTitle,
  onTogglePlay,
}) {
  const icon = isLoading
    ? "progress_activity"
    : isPlaying
      ? "pause"
      : "play_arrow";

  const classes = ["play-icon"];
  if (isCurrent) classes.push("active");
  if (isLoading) classes.push("loading");

  return (
    <>
      {getImageUrl(cover) ? (
        <img src={getImageUrl(cover)} alt="Playlist cover" />
      ) : (
        <div className="playlist-cover-placeholder" aria-hidden="true" />
      )}

      <span
        className={classes.join(" ")}
        title={isLoading ? loadingTitle : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay?.(e);
        }}
      >
        <span className="material-symbols-outlined">{icon}</span>
      </span>
    </>
  );
}

export default PlaylistCover;
