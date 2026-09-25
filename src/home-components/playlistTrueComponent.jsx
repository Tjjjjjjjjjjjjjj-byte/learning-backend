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
}) {
  const [
    editDetailsOpen,
    setEditDetailsOpen,
  ] = useState(false);

  const [
    editDetailsClosing,
    setEditDetailsClosing,
  ] = useState(false);

  const [
    track,
    setTrack,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    downloadingTrackId,
    setDownloadingTrackId,
  ] = useState(null);

  const navigate =
    useNavigate();

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

    setSelectedPlaylist(
      ({
        _openEdit,
        ...playlist
      }) => playlist,
    );
  }, [
    selectedPlaylist,
    setSelectedPlaylist,
  ]);

  useEffect(() => {
    async function getTracks() {
      setLoading(true);

      try {
        const response =
          await fetch(
            `http://localhost:3000/home/playlist/${selectedPlaylist.id}/tracks`,
            {
              credentials:
                "include",
            },
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              "Failed to get tracks",
          );
        }

        setTrack(data);
        setPlaybackTracks(
          data.filter(Boolean),
        );
      } catch (error) {
        console.error(
          "FAILED TO LOAD TRACKS:",
          error,
        );

        setTrack([]);
      } finally {
        setLoading(false);
      }
    }

    getTracks();
  }, [
    selectedPlaylist,
  ]);

  const totalDuration =
    track.reduce(
      (total, song) =>
        total +
        (song?.duration_ms ||
          0),
      0,
    );

  const totalMinutes =
    Math.floor(
      totalDuration / 60000,
    );

  const totalSeconds =
    Math.floor(
      (totalDuration %
        60000) /
        1000,
    );

  return (
    <>
      <main className="playlist-detail">
        <Hero
          selectedPlaylist={
            selectedPlaylist
          }
          trackCount={
            track.length
          }
          totalMinutes={
            totalMinutes
          }
          totalSeconds={
            totalSeconds
          }
        />

        <Features
          setEditDetailsOpen={
            openEditDetails
          }
          track={track}
          setTrack={setTrack}
          selectedPlaylist={
            selectedPlaylist
          }
          current={current}
          setCurrent={setCurrent}
          currentPlaylistId={
            currentPlaylistId
          }
          setCurrentPlaylistId={
            setCurrentPlaylistId
          }
          isPlaying={isPlaying}
          setIsPlaying={
            setIsPlaying
          }
          downloadingTrackId={
            downloadingTrackId
          }
          setDownloadingTrackId={
            setDownloadingTrackId
          }
          setPlaybackTracks={
            setPlaybackTracks
          }
        />

        {loading ? (
          <div className="playlist-loading">
            <span className="material-symbols-outlined">
              progress_activity
            </span>

            <p>
              Loading songs...
            </p>
          </div>
        ) : track.length > 0 ? (
          <section className="song-list">
            <div className="song-header">
              <span>#</span>
              <span>Title</span>
              <span>Album</span>
              <span>
                Date added
              </span>

              <span className="material-symbols-outlined">
                schedule
              </span>

              <span></span>
            </div>

            {track
              .filter(Boolean)
              .map(
                (
                  song,
                  index,
                ) => (
                  <Song
                    key={`${song.id}-${index}`}
                    track={song}
                    index={index}
                    selectedPlaylist={
                      selectedPlaylist
                    }
                    setTrack={
                      setTrack
                    }
                    setCurrent={
                      setCurrent
                    }
                    current={
                      current
                    }
                    currentPlaylistId={
                      currentPlaylistId
                    }
                    setCurrentPlaylistId={
                      setCurrentPlaylistId
                    }
                    isPlaying={
                      isPlaying
                    }
                    setIsPlaying={
                      setIsPlaying
                    }
                    downloadingTrackId={
                      downloadingTrackId
                    }
                    setDownloadingTrackId={
                      setDownloadingTrackId
                    }
                    setPlaybackTracks={
                      setPlaybackTracks
                    }
                  />
                ),
              )}
          </section>
        ) : (
          <section className="empty-playlist">
            <div className="empty-playlist-icon">
              <span className="material-symbols-outlined">
                music_note
              </span>
            </div>

            <h2>
              This playlist is empty
            </h2>

            <p>
              Add songs to start
              building your playlist.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/search",
                )
              }
            >
              <span className="material-symbols-outlined">
                search
              </span>

              Find something
              to play
            </button>
          </section>
        )}
      </main>

      {editDetailsOpen && (
        <EditPlaylistDetails
          selectedPlaylist={
            selectedPlaylist
          }
          setSelectedPlaylist={
            setSelectedPlaylist
          }
          minimized={
            minimized
          }
          closing={
            editDetailsClosing
          }
          onClose={
            closeEditDetails
          }
        />
      )}
    </>
  );
}

export default PlaylistModal;