import { useState } from "react";
import PlaylistCover from "./playlist-cover";

function Playlist({
  name,
  owner,
  id,
  minimized,
  setMaximized,
  maximized,
  viewMode = "list",
  cover,
  status,
  description,
  type,
  spotifyPlaylistId,
  externalUrl,
  selectedPlaylist,
  setSelectedPlaylist,
  nonSidebar = false,
  onAddToPlaylist,
  exists,
  currentPlaylistId,
  setCurrent,
  setCurrentPlaylistId,
  setPlaybackTracks,
  setPlaybackPlaylistId,
  isPlaying,
  setIsPlaying,
  onPlaylistDeleted,
}) {
  const [hovering, setHovering] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [starting, setStarting] = useState(false);

  const isThisPlaylistCurrent = currentPlaylistId === id;
  const isThisPlaylistPlaying = isThisPlaylistCurrent && isPlaying;

  async function togglePlay(e) {
    e?.stopPropagation();

    if (isThisPlaylistCurrent) {
      setIsPlaying(!isPlaying);
      return;
    }

    if (starting) return;

    setStarting(true);

    try {
      const endpoint =
        type === "spotify-public"
          ? `http://localhost:3000/spotify/playlist/${encodeURIComponent(
              spotifyPlaylistId,
            )}/tracks`
          : `http://localhost:3000/home/playlist/${id}/tracks`;

      const response = await fetch(endpoint, {
        credentials: "include",
      });

      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      const data = contentType.includes("application/json") && text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.message || `Failed to load playlist (HTTP ${response.status})`);
      }

      const rawTracks = type === "spotify-public" ? data.tracks : data;
      const playableTracks = Array.isArray(rawTracks)
        ? rawTracks.filter(
            (track) =>
              track?.id &&
              track?.name &&
              track?.artists?.[0]?.name,
          )
        : [];

      if (!playableTracks.length) return;

      const firstTrack = playableTracks[0];

      setPlaybackTracks(playableTracks);
      setPlaybackPlaylistId?.(id);
      setCurrent(firstTrack.id);
      setCurrentPlaylistId(id);
      setIsPlaying(true);
    } catch (error) {
      console.error("Failed to play playlist:", error);
    } finally {
      setStarting(false);
    }
  }

  const deletePlaylist = async (event) => {
    if (event) event.stopPropagation();

    try {
      const endpoint =
        type === "spotify-public"
          ? `http://localhost:3000/spotify/playlist/${encodeURIComponent(
              spotifyPlaylistId,
            )}/save`
          : `http://localhost:3000/home/playlist/${id}`;

      const response = await fetch(endpoint, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete playlist");
      }

      if (selectedPlaylist?.id === id) {
        setSelectedPlaylist(null);
      }

      onPlaylistDeleted?.(id);
      setHidden(true);
    } catch (error) {
      console.error("Failed to delete playlist:", error);
    }
  };

  function selectPlaylist() {
    setSelectedPlaylist(
      selectedPlaylist?.id === id
        ? null
        : {
            name,
            owner,
            cover,
            status,
            description,
            type,
            spotifyPlaylistId,
            externalUrl,
            id,
          },
    );

    if (setMaximized) {
      setMaximized(false);
    }
  }

  if (nonSidebar) {
    return (
      <div className="add-playlist-item">
        <PlaylistCover cover={cover} />

        <div className="add-playlist-info">
          <p className="add-playlist-name">{name || "My Playlist"}</p>
          <p className="add-playlist-owner">Playlist · {owner}</p>
        </div>

        <button
          className={
            exists
              ? "add-playlist-button exists"
              : "add-playlist-button"
          }
          type="button"
          onClick={() => onAddToPlaylist(id)}
        >
          <span className="material-symbols-outlined">
            {exists ? "add" : "add_circle"}
          </span>
        </button>
      </div>
    );
  }

  if (!minimized || maximized) {
    return (
      <div
        className={
          (viewMode === "grid"
            ? "playlistComponent-div grid-view"
            : "playlistComponent-div") +
          (isThisPlaylistCurrent ? " playing" : "")
        }
        onClick={selectPlaylist}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <button className="playlist" type="button">
          <PlaylistCover
            cover={cover}
            isCurrent={isThisPlaylistCurrent}
            isPlaying={isThisPlaylistPlaying || starting}
            onTogglePlay={togglePlay}
          />
        </button>

        <div className="playlist-info">
          <p>{name || "My Playlist"} · {owner}</p>

          {!minimized && hovering && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHidden(false);
              }}
              aria-label="Delete playlist"
            >
              <span className="material-symbols-outlined">delete</span>
            </button>
          )}

          {!hidden && (
            <div
              className="confirmDelete"
              onClick={(e) => e.stopPropagation()}
            >
              <p>
                {type === "spotify-public"
                  ? "Remove this Spotify playlist from your library?"
                  : "Are you sure? This action cannot be undone!"}
              </p>

              <button
                className="del"
                onClick={(e) => {
                  setHidden(true);
                  deletePlaylist(e);
                }}
              >
                DELETE
              </button>

              <button
                className="cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  setHidden(true);
                }}
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      className="playlist"
      type="button"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={selectPlaylist}
    >
      <PlaylistCover
        cover={cover}
        isCurrent={isThisPlaylistCurrent}
        isPlaying={isThisPlaylistPlaying || starting}
        onTogglePlay={togglePlay}
      />
    </button>
  );
}

export default Playlist;
