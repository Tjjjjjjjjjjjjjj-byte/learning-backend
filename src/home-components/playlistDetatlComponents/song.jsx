import { getImageUrl } from "../../utils/imageUrl";
import { useState } from "react";
import { formatRelativeDate } from "../../utils/dateUtils.js";

function Song({
  track,
  index,
  selectedPlaylist,
  isReadOnly = false,
  setTrack,
  setCurrent,
  setCurrentPlaylistId,
  current,
  isPlaying,
  setIsPlaying,
  downloadingTrackId,
  setDownloadingTrackId,
  setPlaybackTracks,
  selectMode,
  isSelected,
  onToggleSelect,
  onAddToQueue,
  onPlayNext,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloadConfirmOpen, setDownloadConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deletingDownload, setDeletingDownload] = useState(false);

  if (!track) return null;

  const isCurrentTrack = current === track.id;
  const isDownloading = downloadingTrackId === track.id;

  function togglePlay(e) {
    if (e) {
      e.stopPropagation();
    }

    if (isCurrentTrack) {
      setIsPlaying(!isPlaying);
      return;
    }

    setCurrent(track.id);
    setCurrentPlaylistId(selectedPlaylist.id);
    setIsPlaying(true);
  }

  function handleRowClick(e) {
    if (selectMode) {
      if (e) e.stopPropagation();
      onToggleSelect?.(track.id);
      return;
    }

    togglePlay(e);
  }

  function formatDuration(duration) {
    const minutes = Math.floor(duration / 60000);

    const seconds = Math.floor((duration % 60000) / 1000);

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  async function downloadSong() {
    if (track.downloaded || isDownloading) {
      return;
    }

    setDownloadingTrackId(track.id);

    try {
      const response = await fetch("http://localhost:3000/song/download", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackId: track.id,
          name: track.name,
          artist: track.artists?.[0]?.name,
            duration_ms: Number(track.duration_ms) || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Download failed");
      }

      setTrack((prev) =>
        prev.map((song) =>
          song.id === track.id
            ? {
                ...song,
                downloaded: true,
              }
            : song,
        ),
      );

      setPlaybackTracks((prev) =>
        prev.map((song) =>
          song.id === track.id
            ? {
                ...song,
                downloaded: true,
              }
            : song,
        ),
      );
    } catch (error) {
      console.error("DOWNLOAD ERROR:", error);
    } finally {
      setDownloadingTrackId(null);
    }
  }

  async function deleteDownload() {
    if (!track.downloaded || deletingDownload) {
      return;
    }

    if (current === track.id) {
      setIsPlaying(false);
      setCurrent(null);
    }

    setDeletingDownload(true);

    try {
      const response = await fetch(
        `http://localhost:3000/song/download/${encodeURIComponent(track.id)}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete download");
      }

      setTrack((prev) =>
        prev.map((song) =>
          song.id === track.id
            ? {
                ...song,
                downloaded: false,
              }
            : song,
        ),
      );

      setPlaybackTracks((prev) =>
        prev.map((song) =>
          song.id === track.id
            ? {
                ...song,
                downloaded: false,
              }
            : song,
        ),
      );

      setDownloadConfirmOpen(false);
    } catch (error) {
      console.error("DELETE DOWNLOAD ERROR:", error);
    } finally {
      setDeletingDownload(false);
    }
  }

  async function deleteSong() {
    if (isReadOnly || removing) return;

    setRemoving(true);

    try {
      const response = await fetch(
        `http://localhost:3000/add/${selectedPlaylist.id}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            trackId: track.id,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to remove song");
      }

      setTrack((prev) => prev.filter((song) => song.id !== track.id));

      setConfirmOpen(false);
    } catch (error) {
      console.error("REMOVE SONG ERROR:", error);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <div
        className={`song-card${
          isCurrentTrack ? " current" : ""
        }${isSelected ? " selected" : ""}`}
        onClick={handleRowClick}
      >
        <div className="song-number">
          {selectMode ? (
            <button
              type="button"
              className={
                isSelected
                  ? "song-select-checkbox checked"
                  : "song-select-checkbox"
              }
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(track.id);
              }}
              aria-pressed={isSelected}
              title={isSelected ? "Deselect" : "Select"}
            >
              <span className="material-symbols-outlined">
                {isSelected ? "check_box" : "check_box_outline_blank"}
              </span>
            </button>
          ) : track.downloaded ? (
            <button
              className="song-download-indicator downloaded"
              type="button"
              title="Delete downloaded file"
              disabled={deletingDownload}
              onClick={(e) => {
                e.stopPropagation();
                setDownloadConfirmOpen(true);
              }}
            >
              <span className="material-symbols-outlined">download_done</span>
            </button>
          ) : isDownloading ? (
            <span
              className="song-download-indicator downloading"
              title="Downloading"
            >
              <span className="material-symbols-outlined">
                progress_activity
              </span>
            </span>
          ) : (
            <button
              className="song-download-indicator"
              type="button"
              title="Download song"
              onClick={(e) => {
                e.stopPropagation();
                downloadSong();
              }}
            >
              <span className="material-symbols-outlined">download</span>
            </button>
          )}

          {!selectMode && <span className="song-index">{index + 1}</span>}

          {!selectMode && (
            <button
              className="song-row-play"
              type="button"
              onClick={togglePlay}
            >
              <span className="material-symbols-outlined">
                {isCurrentTrack && isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
          )}
        </div>

        <div className="song-title">
          <img
            src={getImageUrl(track.album?.images?.[0]?.url)}
            alt={track.album?.name || track.name}
          />

          <div className="song-title-info">
            <p className="song-name">{track.name}</p>

            <p className="song-artist">
              {track.artists?.map((artist) => artist.name).join(", ")}
            </p>
          </div>
        </div>

        <p className="song-album">{track.album?.name}</p>

        <p className="song-date">{formatRelativeDate(track.addedAt)}</p>

        <p className="song-duration">{formatDuration(track.duration_ms)}</p>

        <div className="song-actions">
          {!selectMode && (
            <>
              <button
                className="song-queue-action"
                type="button"
                title="Play next"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayNext?.(track);
                }}
              >
                <span className="material-symbols-outlined">next_plan</span>
              </button>

              <button
                className="song-queue-action"
                type="button"
                title="Add to queue"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToQueue?.(track);
                }}
              >
                <span className="material-symbols-outlined">queue_music</span>
              </button>
            </>
          )}

          {!isReadOnly && (
            <button
              className="delete"
              type="button"
              title="Remove from playlist"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
            >
              <span className="material-symbols-outlined">delete</span>
            </button>
          )}
        </div>
      </div>

      {confirmOpen && !isReadOnly && (
        <div className="confirm">
          <div>
            <p>Are you sure? This action cannot be undone</p>

            <div className="confirm-buttons">
              <button
                className="DELETE"
                disabled={removing}
                onClick={deleteSong}
              >
                Yes, Delete
              </button>

              <button
                className="No"
                disabled={removing}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {downloadConfirmOpen && (
        <div className="download-confirm">
          <div>
            <span className="material-symbols-outlined">download_done</span>

            <h3>Delete downloaded file?</h3>

            <p>{track.name} will stay in this playlist.</p>

            <div className="download-confirm-buttons">
              <button
                className="download-delete-confirm"
                disabled={deletingDownload}
                onClick={deleteDownload}
              >
                Delete Download
              </button>

              <button
                className="download-cancel-confirm"
                disabled={deletingDownload}
                onClick={() => setDownloadConfirmOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Song;
