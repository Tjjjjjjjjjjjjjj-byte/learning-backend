import { useState, useEffect, useRef } from "react";
import Playlist from "../home-components/playlists/playlistComponent";

function TrackCard({
  track,
  playlists,
  isCurrentTrack,
  isPlaying,
  onPlay,
  setIsPlaying
}) {
  const [hidden, setHidden] = useState(true);
  const [exists, setExists] = useState([]);
  const [downloaded, setDownloaded] = useState(!!track.downloaded);
  const [downloading, setDownloading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingDownload, setDeletingDownload] = useState(false);
  const containerRef = useRef(null);
  
  function togglePlay(e) {
    if (e) {
      e.stopPropagation();
    }

    if (isCurrentTrack) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrent(track.id);

      setCurrentPlaylistId(selectedPlaylist.id);

      setIsPlaying(true);
    }
  }

  function handleRowClick(e) {
    if (selectMode) {
      if (e) e.stopPropagation();
      onToggleSelect?.(track.id);
      return;
    }

    togglePlay(e);
  }

  useEffect(() => {
    setDownloaded(!!track.downloaded);
  }, [track.downloaded]);

  async function downloadSong() {
    if (downloaded || downloading) return;

    setDownloading(true);

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
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Download failed");
      }

      setDownloaded(true);
    } catch (error) {
      console.error("DOWNLOAD ERROR:", error);
    } finally {
      setDownloading(false);
    }
  }

  async function deleteDownload() {
    if (!downloaded || deletingDownload) return;

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

      setDownloaded(false);
      setConfirmDelete(false);
    } catch (error) {
      console.error("DELETE DOWNLOAD ERROR:", error);
    } finally {
      setDeletingDownload(false);
    }
  }

  useEffect(() => {
    const existingPlaylists = playlists
      .filter((playlist) => playlist.songs?.includes(track.id))
      .map((playlist) => playlist.id);

    setExists(existingPlaylists);
  }, [playlists, track.id]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setHidden(true);
        setConfirmDelete(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function addToPlaylist(playlistId) {
    const isAdded = exists.includes(playlistId);

    try {
      const response = await fetch(`http://localhost:3000/add/${playlistId}`, {
        method: isAdded ? "DELETE" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trackId: track.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update playlist");
      }

      setExists((current) =>
        isAdded
          ? current.filter((id) => id !== playlistId)
          : [...current, playlistId],
      );
    } catch (error) {
      console.error("Failed to update playlist:", error);
    }
  }

  return (
    <article
      className={`search-result-card${!hidden ? " playlist-open" : ""}${
        isCurrentTrack ? " playing" : ""
      }`}
      ref={containerRef}
      onClick={togglePlay}
    >
      <div className="search-result-cover">
        <img
          src={track.album?.images?.[0]?.url}
          alt={track.album?.name || track.name}
        />

        <button
          className={
            isCurrentTrack ? "track-play playing" : "track-play"
          }
          type="button"
          title={isCurrentTrack && isPlaying ? "Pause" : "Play"}
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.(track);
          }}
        >
          <span className="material-symbols-outlined">
            {isCurrentTrack && isPlaying ? "pause" : "play_arrow"}
          </span>
        </button>
      </div>

      <div className="search-result-info">
        <h3>{track.name}</h3>
        <p>{track.artists?.map((artist) => artist.name).join(", ")}</p>
        <p className="search-result-album">{track.album?.name}</p>
      </div>

      <button
        className="add-playlist"
        type="button"
        onClick={() => setHidden(!hidden)}
        title="Add to playlist"
      >
        <span className="material-symbols-outlined">add_circle</span>
      </button>

      {downloading ? (
        <span
          className="track-download-state downloading"
          title="Downloading"
        >
          <span className="material-symbols-outlined">progress_activity</span>
        </span>
      ) : downloaded ? (
        <button
          className="track-download downloaded"
          type="button"
          title="Downloaded — delete download"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDelete(true);
          }}
        >
          <span className="material-symbols-outlined">download_done</span>
        </button>
      ) : (
        <button
          className="track-download"
          type="button"
          title="Download"
          onClick={(e) => {
            e.stopPropagation();
            downloadSong();
          }}
        >
          <span className="material-symbols-outlined">download</span>
        </button>
      )}

      {confirmDelete && (
        <div className="search-download-confirm">
          <p>Delete downloaded file?</p>
          <span>{track.name} will stay in your playlists.</span>
          <div>
            <button
              type="button"
              onClick={deleteDownload}
              disabled={deletingDownload}
            >
              Delete Download
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deletingDownload}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!hidden && (
        <div className="add-to-playlist-div">
          <div className="add-to-playlist-header">
            <span>Add to playlist</span>
            <button type="button" onClick={() => setHidden(true)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="add-to-playlist-list">
            {playlists.map((playlist) => (
              <Playlist
                key={playlist.id}
                name={playlist.name}
                owner={playlist.owner}
                cover={playlist.cover}
                id={playlist.id}
                nonSidebar={true}
                onAddToPlaylist={addToPlaylist}
                exists={exists.includes(playlist.id)}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default TrackCard;