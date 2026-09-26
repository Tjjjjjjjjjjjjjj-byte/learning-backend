import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Hero from "./playlistDetatlComponents/hero";
import EditPlaylistDetails from "./playlistDetatlComponents/editdetails";
import Features from "./playlistDetatlComponents/features";
import "../styling/playlistModal.css";
import Song from "./playlistDetatlComponents/song";

function PlaylistModal({
  selectedPlaylist,
  setSelectedPlaylist,
  minimized,
  setCurrent,
  current,
  currentPlaylistId,
  setCurrentPlaylistId,
  isPlaying,
  setIsPlaying,
  setPlaybackTracks,
  setPlaybackPlaylistId,
  onAddToQueue,
  onPlayNext,
}) {
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);

  const [editDetailsClosing, setEditDetailsClosing] = useState(false);

  const [track, setTrack] = useState([]);

  const [loading, setLoading] = useState(true);

  const [downloadingTrackId, setDownloadingTrackId] = useState(null);

  const [selectMode, setSelectMode] = useState(false);

  const [selectedIds, setSelectedIds] = useState([]);

  const [bulkBusy, setBulkBusy] = useState(false);

  const [bulkConfirm, setBulkConfirm] = useState(null);

  const [addToPlaylistOpen, setAddToPlaylistOpen] = useState(false);

  const [otherPlaylists, setOtherPlaylists] = useState([]);

  const navigate = useNavigate();

  function openEditDetails() {
    setEditDetailsClosing(false);
    setEditDetailsOpen(true);
  }

  function closeEditDetails() {
    setEditDetailsClosing(true);

    setTimeout(() => {
      setEditDetailsOpen(false);
      setEditDetailsClosing(false);
    }, 180);
  }

  useEffect(() => {
    if (!selectedPlaylist?._openEdit) {
      return;
    }

    setEditDetailsOpen(true);

    setSelectedPlaylist(({ _openEdit, ...playlist }) => playlist);
  }, [selectedPlaylist, setSelectedPlaylist]);

  useEffect(() => {
    async function getTracks() {
      setLoading(true);

      try {
        const endpoint =
          selectedPlaylist.type === "spotify-public"
            ? `http://localhost:3000/spotify/playlist/${encodeURIComponent(
                selectedPlaylist.spotifyPlaylistId,
              )}/tracks`
            : `http://localhost:3000/home/playlist/${selectedPlaylist.id}/tracks`;

        const response = await fetch(endpoint, {
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to get tracks");
        }

        setTrack(data);
        setPlaybackTracks(data.filter(Boolean));
        setPlaybackPlaylistId(selectedPlaylist.id);
      } catch (error) {
        console.error("FAILED TO LOAD TRACKS:", error);

        setTrack([]);
      } finally {
        setLoading(false);
      }
    }

    getTracks();
  }, [selectedPlaylist]);

  useEffect(() => {
    async function fetchPlaylists() {
      try {
        const response = await fetch("http://localhost:3000/home", {
          credentials: "include",
        });

        const data = await response.json();

        if (response.ok) {
          setOtherPlaylists(
            (data.playlists || []).filter(
              (playlist) => playlist.type !== "spotify-public",
            ),
          );
        }
      } catch (error) {
        console.error("FAILED TO LOAD PLAYLISTS FOR BULK ADD:", error);
      }
    }

    fetchPlaylists();
  }, []);

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds([]);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds([]);
    setAddToPlaylistOpen(false);
  }

  function toggleSelected(trackId) {
    setSelectedIds((prev) =>
      prev.includes(trackId)
        ? prev.filter((id) => id !== trackId)
        : [...prev, trackId],
    );
  }

  function selectAll() {
    setSelectedIds(track.filter(Boolean).map((song) => song.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function bulkDownload() {
    if (bulkBusy || selectedIds.length === 0) {
      return;
    }

    const songsToDownload = track.filter(
      (song) => song && selectedIds.includes(song.id) && !song.downloaded,
    );

    if (songsToDownload.length === 0) {
      return;
    }

    setBulkBusy(true);

    for (const song of songsToDownload) {
      try {
        const response = await fetch("http://localhost:3000/song/download", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            trackId: song.id,
            name: song.name,
            artist: song.artists?.[0]?.name,
            duration_ms: Number(song.duration_ms) || null,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || `Failed to download ${song.name}`);
        }

        setTrack((prev) =>
          prev.map((s) =>
            s?.id === song.id
              ? {
                  ...s,
                  downloaded: true,
                }
              : s,
          ),
        );

        setPlaybackTracks((prev) =>
          prev.map((s) =>
            s?.id === song.id
              ? {
                  ...s,
                  downloaded: true,
                }
              : s,
          ),
        );
      } catch (error) {
        console.error(`BULK DOWNLOAD FAILED: ${song.name}`, error);
      }
    }

    setBulkBusy(false);
  }

  async function bulkDeleteDownload() {
    if (bulkBusy || selectedIds.length === 0) {
      return;
    }

    const songsToDelete = track.filter(
      (song) => song && selectedIds.includes(song.id) && song.downloaded,
    );

    if (songsToDelete.length === 0) {
      return;
    }

    setBulkBusy(true);

    for (const song of songsToDelete) {
      try {
        const response = await fetch(
          `http://localhost:3000/song/download/${encodeURIComponent(song.id)}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || `Failed to delete download for ${song.name}`,
          );
        }

        if (current === song.id) {
          setIsPlaying(false);
          setCurrent(null);
        }

        setTrack((prev) =>
          prev.map((s) =>
            s?.id === song.id
              ? {
                  ...s,
                  downloaded: false,
                }
              : s,
          ),
        );

        setPlaybackTracks((prev) =>
          prev.map((s) =>
            s?.id === song.id
              ? {
                  ...s,
                  downloaded: false,
                }
              : s,
          ),
        );
      } catch (error) {
        console.error(`BULK DELETE DOWNLOAD FAILED: ${song.name}`, error);
      }
    }

    setBulkBusy(false);
  }

  async function bulkRemoveFromPlaylist() {
    if (
      selectedPlaylist.type === "spotify-public" ||
      bulkBusy ||
      selectedIds.length === 0
    ) {
      return;
    }

    setBulkBusy(true);

    const idsToRemove = [...selectedIds];

    for (const trackId of idsToRemove) {
      try {
        const response = await fetch(
          `http://localhost:3000/add/${selectedPlaylist.id}`,
          {
            method: "DELETE",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ trackId }),
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to remove song");
        }

        setTrack((prev) => prev.filter((s) => s?.id !== trackId));
      } catch (error) {
        console.error(`BULK REMOVE FAILED: ${trackId}`, error);
      }
    }

    setSelectedIds((prev) => prev.filter((id) => !idsToRemove.includes(id)));

    setBulkBusy(false);
  }

  async function bulkAddToPlaylist(targetPlaylistId) {
    if (
      selectedPlaylist.type === "spotify-public" ||
      bulkBusy ||
      selectedIds.length === 0
    ) {
      return;
    }

    const songsToAdd = track.filter(
      (song) => song && selectedIds.includes(song.id),
    );

    if (songsToAdd.length === 0) {
      return;
    }

    setBulkBusy(true);

    for (const song of songsToAdd) {
      try {
        const response = await fetch(
          `http://localhost:3000/add/${targetPlaylistId}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              trackId: song.id,
            }),
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || `Failed to add ${song.name}`);
        }
      } catch (error) {
        console.error(`BULK ADD FAILED: ${song.name}`, error);
      }
    }

    setAddToPlaylistOpen(false);

    setBulkBusy(false);
  }

  function requestBulkDeleteDownload() {
    const eligible = track.filter(
      (song) => song && selectedIds.includes(song.id) && song.downloaded,
    );

    if (eligible.length === 0) {
      return;
    }

    setBulkConfirm({
      type: "deleteDownload",
      count: eligible.length,
    });
  }

  function requestBulkRemove() {
    if (selectedIds.length === 0) {
      return;
    }

    setBulkConfirm({
      type: "remove",
      count: selectedIds.length,
    });
  }

  async function confirmBulkAction() {
    const pending = bulkConfirm;

    setBulkConfirm(null);

    if (!pending) return;

    if (pending.type === "deleteDownload") {
      await bulkDeleteDownload();
    } else if (pending.type === "remove") {
      await bulkRemoveFromPlaylist();
    }
  }

  const isReadOnly = selectedPlaylist.type === "spotify-public";

  const totalDuration = track.reduce(
    (total, song) => total + (song?.duration_ms || 0),
    0,
  );

  const totalMinutes = Math.floor(totalDuration / 60000);

  const totalSeconds = Math.floor((totalDuration % 60000) / 1000);

  return (
    <>
      <main className="playlist-detail">
        <Hero
          selectedPlaylist={selectedPlaylist}
          trackCount={track.length}
          totalMinutes={totalMinutes}
          totalSeconds={totalSeconds}
        />

        <Features
          setEditDetailsOpen={openEditDetails}
          isReadOnly={isReadOnly}
          track={track}
          setTrack={setTrack}
          selectedPlaylist={selectedPlaylist}
          current={current}
          setCurrent={setCurrent}
          currentPlaylistId={currentPlaylistId}
          setCurrentPlaylistId={setCurrentPlaylistId}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          downloadingTrackId={downloadingTrackId}
          setDownloadingTrackId={setDownloadingTrackId}
          setPlaybackTracks={setPlaybackTracks}
          onEnterSelectMode={enterSelectMode}
        />

        {selectMode && !isReadOnly && (
          <div className="bulk-select-bar">
            <div className="bulk-select-info">
              <button
                type="button"
                className="bulk-select-exit"
                onClick={exitSelectMode}
                title="Exit selection"
              >
                <span className="material-symbols-outlined">close</span>
              </button>

              <span>{selectedIds.length} selected</span>

              <button
                type="button"
                className="bulk-select-link"
                onClick={
                  selectedIds.length === track.filter(Boolean).length
                    ? clearSelection
                    : selectAll
                }
              >
                {selectedIds.length === track.filter(Boolean).length
                  ? "Clear"
                  : "Select all"}
              </button>
            </div>

            <div className="bulk-select-actions">
              <button
                type="button"
                onClick={bulkDownload}
                disabled={bulkBusy || selectedIds.length === 0}
                title="Download selected"
              >
                <span className="material-symbols-outlined">download</span>
                Download
              </button>

              <button
                type="button"
                onClick={requestBulkDeleteDownload}
                disabled={bulkBusy || selectedIds.length === 0}
                title="Delete downloads for selected"
              >
                <span className="material-symbols-outlined">download_done</span>
                Delete Download
              </button>

              <div className="bulk-add-wrapper">
                <button
                  type="button"
                  onClick={() => setAddToPlaylistOpen(!addToPlaylistOpen)}
                  disabled={bulkBusy || selectedIds.length === 0}
                  title="Add selected to another playlist"
                >
                  <span className="material-symbols-outlined">
                    playlist_add
                  </span>
                  Add to Playlist
                </button>

                {addToPlaylistOpen && (
                  <div className="bulk-add-menu">
                    {otherPlaylists.filter(
                      (playlist) => playlist.id !== selectedPlaylist.id,
                    ).length === 0 ? (
                      <p className="bulk-add-empty">No other playlists</p>
                    ) : (
                      otherPlaylists
                        .filter(
                          (playlist) => playlist.id !== selectedPlaylist.id,
                        )
                        .map((playlist) => (
                          <button
                            key={playlist.id}
                            type="button"
                            disabled={bulkBusy}
                            onClick={() => bulkAddToPlaylist(playlist.id)}
                          >
                            {playlist.name || "Untitled playlist"}
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="bulk-remove"
                onClick={requestBulkRemove}
                disabled={bulkBusy || selectedIds.length === 0}
                title="Remove selected from this playlist"
              >
                <span className="material-symbols-outlined">delete</span>
                Remove from Playlist
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="playlist-loading">
            <span className="material-symbols-outlined">progress_activity</span>

            <p>Loading songs...</p>
          </div>
        ) : track.length > 0 ? (
          <section className="song-list">
            <div className="song-header">
              <span>#</span>
              <span>Title</span>
              <span>Album</span>
              <span>Date added</span>

              <span className="material-symbols-outlined">schedule</span>

              <span></span>
            </div>

            {track.filter(Boolean).map((song, index) => (
              <Song
                key={`${song.id}-${index}`}
                track={song}
                index={index}
                selectedPlaylist={selectedPlaylist}
                isReadOnly={isReadOnly}
                setTrack={setTrack}
                setCurrent={setCurrent}
                current={current}
                currentPlaylistId={currentPlaylistId}
                setCurrentPlaylistId={setCurrentPlaylistId}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                downloadingTrackId={downloadingTrackId}
                setDownloadingTrackId={setDownloadingTrackId}
                setPlaybackTracks={setPlaybackTracks}
                selectMode={selectMode}
                isSelected={selectedIds.includes(song.id)}
                onToggleSelect={toggleSelected}
                onAddToQueue={onAddToQueue}
                onPlayNext={onPlayNext}
              />
            ))}
          </section>
        ) : (
          <section className="empty-playlist">
            <div className="empty-playlist-icon">
              <span className="material-symbols-outlined">music_note</span>
            </div>

            <h2>This playlist is empty</h2>

            <p>
              {isReadOnly
                ? "This Spotify playlist has no available tracks."
                : "Add songs to start building your playlist."}
            </p>

            <button type="button" onClick={() => navigate("/search")}>
              <span className="material-symbols-outlined">search</span>
              Find something to play
            </button>
          </section>
        )}
      </main>

      {bulkConfirm && (
        <div className="confirm">
          <div>
            <p>
              {bulkConfirm.type === "remove"
                ? `Remove ${bulkConfirm.count} song${
                    bulkConfirm.count === 1 ? "" : "s"
                  } from this playlist? This action cannot be undone.`
                : `Delete the downloaded file for ${bulkConfirm.count} song${
                    bulkConfirm.count === 1 ? "" : "s"
                  }? This action cannot be undone.`}
            </p>

            <div className="confirm-buttons">
              <button
                className="DELETE"
                disabled={bulkBusy}
                onClick={confirmBulkAction}
              >
                Yes, {bulkConfirm.type === "remove" ? "Remove" : "Delete"}
              </button>

              <button
                className="No"
                disabled={bulkBusy}
                onClick={() => setBulkConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editDetailsOpen && !isReadOnly && (
        <EditPlaylistDetails
          selectedPlaylist={selectedPlaylist}
          setSelectedPlaylist={setSelectedPlaylist}
          minimized={minimized}
          closing={editDetailsClosing}
          onClose={closeEditDetails}
        />
      )}
    </>
  );
}

export default PlaylistModal;
