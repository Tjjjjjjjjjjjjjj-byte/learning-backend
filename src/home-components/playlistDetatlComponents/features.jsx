import { useState } from "react";

function Features({
  setEditDetailsOpen,
  track,
  setTrack,
  selectedPlaylist,
  current,
  setCurrent,
  currentPlaylistId,
  setCurrentPlaylistId,
  isPlaying,
  setIsPlaying,
  downloadingTrackId,
  setDownloadingTrackId,
  setPlaybackTracks,
  onEnterSelectMode,
}) {
  const isThisPlaylistPlaying =
    currentPlaylistId ===
      selectedPlaylist.id &&
    isPlaying;

  const hasSongs =
    track &&
    track.length > 0;

  const allDownloaded =
    hasSongs &&
    track.every(
      (song) =>
        song?.downloaded,
    );

  const [
    downloadingIds,
    setDownloadingIds,
  ] = useState({});

  const [
    progress,
    setProgress,
  ] = useState({
    current: 0,
    total: 0,
  });

  const [
    failedCount,
    setFailedCount,
  ] = useState(0);

  const [
    optionsOpen,
    setOptionsOpen,
  ] = useState(false);

  const isDownloading =
    !!downloadingIds[
      selectedPlaylist.id
    ];

  const status =
    isDownloading
      ? "downloading"
      : allDownloaded
        ? "done"
        : failedCount > 0
          ? "error"
          : "idle";

  function togglePlaylistPlay() {
    if (!hasSongs) return;

    if (
      currentPlaylistId ===
      selectedPlaylist.id
    ) {
      setIsPlaying(
        !isPlaying,
      );
    } else {
      setCurrent(
        track[0].id,
      );

      setCurrentPlaylistId(
        selectedPlaylist.id,
      );

      setIsPlaying(true);
    }
  }

  async function handleDownload() {
    if (
      !hasSongs ||
      isDownloading ||
      allDownloaded
    ) {
      return;
    }

    const playlistId =
      selectedPlaylist.id;

    const songsToDownload =
      track.filter(
        (song) =>
          song &&
          !song.downloaded,
      );

    setFailedCount(0);

    setProgress({
      current: 0,
      total:
        songsToDownload.length,
    });

    setDownloadingIds(
      (prev) => ({
        ...prev,
        [playlistId]: true,
      }),
    );

    let failures = 0;

    for (
      let index = 0;
      index <
      songsToDownload.length;
      index += 1
    ) {
      const song =
        songsToDownload[
          index
        ];

      setDownloadingTrackId(
        song.id,
      );

      setProgress({
        current: index + 1,
        total:
          songsToDownload.length,
      });

      try {
        const response =
          await fetch(
            "http://localhost:3000/song/download",
            {
              method: "POST",
              credentials:
                "include",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(
                {
                  trackId:
                    song.id,
                  name:
                    song.name,
                  artist:
                    song.artists?.[0]
                      ?.name,
                },
              ),
            },
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              `Failed to download ${song.name}`,
          );
        }

        setTrack(
          (prev) =>
            prev.map(
              (currentSong) =>
                currentSong?.id ===
                song.id
                  ? {
                      ...currentSong,
                      downloaded:
                        true,
                    }
                  : currentSong,
            ),
        );

        setPlaybackTracks(
          (prev) =>
            prev.map(
              (currentSong) =>
                currentSong?.id ===
                song.id
                  ? {
                      ...currentSong,
                      downloaded:
                        true,
                    }
                  : currentSong,
            ),
        );
      } catch (error) {
        failures += 1;

        console.error(
          `PLAYLIST DOWNLOAD FAILED: ${song.name}`,
          error,
        );
      }
    }

    setDownloadingTrackId(
      null,
    );

    setFailedCount(
      failures,
    );

    setDownloadingIds(
      (prev) => ({
        ...prev,
        [playlistId]: false,
      }),
    );
  }

  return (
    <section className="playlist-features">
      <button
        className="playlist-play-button"
        type="button"
        onClick={
          togglePlaylistPlay
        }
        disabled={!hasSongs}
      >
        <span className="material-symbols-outlined">
          {isThisPlaylistPlaying
            ? "pause"
            : "play_arrow"}
        </span>
      </button>

      <button
        className={`playlist-feature-button download-button ${status}`}
        type="button"
        onClick={
          handleDownload
        }
        disabled={
          !hasSongs ||
          isDownloading ||
          allDownloaded
        }
        title={
          status === "done"
            ? "All songs downloaded"
            : status ===
                "downloading"
              ? `Downloading ${progress.current}/${progress.total}`
              : status === "error"
                ? `${failedCount} download${
                    failedCount ===
                    1
                      ? ""
                      : "s"
                  } failed — retry`
                : "Download playlist"
        }
      >
        <span className="material-symbols-outlined">
          {status ===
          "downloading"
            ? "progress_activity"
            : status === "done"
              ? "download_done"
              : status ===
                  "error"
                ? "warning"
                : "download"}
        </span>

        {status ===
          "downloading" && (
          <span className="download-progress-text">
            {progress.current}/
            {progress.total}
          </span>
        )}

        {status ===
          "error" && (
          <span className="download-progress-text">
            {failedCount} failed
          </span>
        )}
      </button>

      <button
        className="playlist-feature-button"
        type="button"
        onClick={() =>
          setEditDetailsOpen(
            true,
          )
        }
        title="Edit playlist details"
      >
        <span className="material-symbols-outlined">
          edit
        </span>
      </button>

      <div className="playlist-options-wrapper">
        <button
          className="playlist-feature-button"
          type="button"
          onClick={() =>
            setOptionsOpen(
              !optionsOpen,
            )
          }
          title="More options"
          aria-expanded={
            optionsOpen
          }
        >
          <span className="material-symbols-outlined">
            more_horiz
          </span>
        </button>

        {optionsOpen && (
          <div className="playlist-options-menu">
            <button
              type="button"
              onClick={() => {
                setOptionsOpen(
                  false,
                );

                setEditDetailsOpen(
                  true,
                );
              }}
            >
              <span className="material-symbols-outlined">
                edit
              </span>

              Edit details
            </button>

            <button
              type="button"
              onClick={() => {
                setOptionsOpen(
                  false,
                );

                handleDownload();
              }}
              disabled={
                !hasSongs ||
                allDownloaded ||
                isDownloading
              }
            >
              <span className="material-symbols-outlined">
                download
              </span>

              Download remaining
            </button>

            <button
              type="button"
              onClick={() => {
                setOptionsOpen(
                  false,
                );

                onEnterSelectMode?.();
              }}
              disabled={
                !hasSongs
              }
            >
              <span className="material-symbols-outlined">
                checklist
              </span>

              Select songs
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default Features;