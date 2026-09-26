import { useEffect, useMemo, useState } from "react";
import LyricsSection from "./lyricsSection.jsx";

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);

  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getCover(track) {
  return track?.album?.images?.[0]?.url || "";
}

function getArtist(track) {
  return (
    track?.artists
      ?.map((artist) => artist.name)
      .join(", ") || "Unknown artist"
  );
}

function formatTrackDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "0:00";
  }

  return formatTime(durationMs / 1000);
}

function TrackLine({
  track,
  current,
  onPlay,
  onRemove,
  onReorder,
}) {
  const [dragging, setDragging] = useState(false);
  const isCurrent = track?.id === current;

  function handleDragStart(event) {
    if (isCurrent) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", track.id);
    setDragging(true);
  }

  function handleDragEnd() {
    setDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();

    const sourceId = event.dataTransfer.getData("text/plain");

    setDragging(false);

    if (!sourceId || sourceId === track.id || isCurrent) {
      return;
    }

    onReorder?.(sourceId, track.id);
  }

  return (
    <div
      className={`queue-track${
        isCurrent ? " current" : ""
      }${dragging ? " dragging" : ""}`}
      draggable={!isCurrent}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <button
        className="queue-track-main"
        type="button"
        onClick={() => onPlay(track.id)}
      >
        {!isCurrent && (
          <span
            className="material-symbols-outlined queue-drag-handle"
            title="Drag to reorder"
          >
            drag_indicator
          </span>
        )}

        <img
          src={getCover(track)}
          alt=""
        />

        <span className="queue-track-info">
          <strong>{track?.name}</strong>
          <small>{getArtist(track)}</small>
        </span>

        <span className="queue-track-duration">
          {formatTrackDuration(track?.duration_ms)}
        </span>

        {isCurrent && (
          <span className="material-symbols-outlined queue-current-icon">
            equalizer
          </span>
        )}
      </button>

      {!isCurrent && (
        <button
          className="queue-remove"
          type="button"
          title="Remove from queue"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(track.id);
          }}
        >
          <span className="material-symbols-outlined">
            close
          </span>
        </button>
      )}
    </div>
  );
}

function QueuePanel({
  player,
  onClose,
}) {
  const {
    current,
    playbackTracks,
    playQueueTrack,
    removeFromQueue,
    reorderQueue,
    clearQueue,
  } = player;

  const currentTrack =
    playbackTracks.find(
      (track) => track?.id === current,
    );

  const nextTracks = useMemo(() => {
    const currentIndex =
      playbackTracks.findIndex(
        (track) => track?.id === current,
      );

    if (currentIndex === -1) {
      return playbackTracks;
    }

    return playbackTracks.slice(
      currentIndex + 1,
    );
  }, [playbackTracks, current]);

  return (
    <aside className="queue-panel">
      <div className="queue-header">
        <div>
          <h2>Queue</h2>
          <span>
            {playbackTracks.length} songs
          </span>
        </div>

        <div className="queue-header-actions">
          <button
            type="button"
            onClick={clearQueue}
            title="Clear queue"
          >
            <span className="material-symbols-outlined">
              delete_sweep
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Close queue"
          >
            <span className="material-symbols-outlined">
              close
            </span>
          </button>
        </div>
      </div>

      <div className="queue-content">
        {currentTrack && (
          <section>
            <h3>Now playing</h3>

            <TrackLine
              track={currentTrack}
              current={current}
              onPlay={playQueueTrack}
              onRemove={removeFromQueue}
              onReorder={reorderQueue}
            />
          </section>
        )}

        <section>
          <h3>Next in queue</h3>

          {nextTracks.length > 0 ? (
            nextTracks.map(
              (track, index) => (
                <TrackLine
                  key={`${track.id}-${index}`}
                  track={track}
                  current={current}
                  onPlay={playQueueTrack}
                  onRemove={removeFromQueue}
                  onReorder={reorderQueue}
                />
              ),
            )
          ) : (
            <p className="queue-empty">
              Nothing else is queued.
            </p>
          )}
        </section>

        <div className="queue-actions">
          <button
            type="button"
            onClick={clearQueue}
            disabled={!currentTrack}
          >
            <span className="material-symbols-outlined">
              clear_all
            </span>

            Clear after current
          </button>
        </div>
      </div>
    </aside>
  );
}

function ExpandedPlayer({
  player,
  onClose,
}) {
  const [queueOpen, setQueueOpen] =
    useState(false);

  const [lyricsOpen, setLyricsOpen] =
    useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const {
    currentTrack,
    current,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeatMode,
    togglePlay,
    nextTrack,
    previousTrack,
    toggleShuffle,
    cycleRepeat,
    seekTo,
    sleepTimerMinutes,
    sleepRemaining,
    setSleepTimer,
    clearSleepTimer,
  } = player;

  const repeatIcon =
    repeatMode === "one"
      ? "repeat_one"
      : "repeat";

  return (
    <div className="now-playing-overlay">
      <div className="now-playing-expanded">
        <div className="now-playing-expanded-top">
          <button
            type="button"
            onClick={onClose}
            title="Close now playing"
          >
            <span className="material-symbols-outlined">
              keyboard_arrow_down
            </span>
          </button>

          <span>NOW PLAYING</span>

          <button
            type="button"
            className={
              queueOpen ? "active" : ""
            }
            onClick={() =>
              setQueueOpen(!queueOpen)
            }
            title="Queue"
          >
            <span className="material-symbols-outlined">
              queue_music
            </span>
          </button>
        </div>

        {queueOpen ? (
          <QueuePanel
            player={player}
            onClose={() =>
              setQueueOpen(false)
            }
          />
        ) : (
          <div className="now-playing-expanded-content">
            <img
              className="now-playing-large-cover"
              src={getCover(currentTrack)}
              alt={
                currentTrack?.album?.name ||
                currentTrack?.name ||
                ""
              }
            />

            <div className="now-playing-expanded-info">
              <h1>
                {currentTrack?.name ||
                  "Nothing playing"}
              </h1>

              <p>
                {getArtist(currentTrack)}
              </p>
            </div>

            <div className="now-playing-expanded-progress">
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(
                  currentTime,
                  duration || 0,
                )}
                onChange={(event) =>
                  seekTo(
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />

              <div>
                <span>
                  {formatTime(currentTime)}
                </span>

                <span>
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            <div className="now-playing-expanded-controls">
              <button
                type="button"
                className={
                  shuffle ? "active" : ""
                }
                onClick={toggleShuffle}
                title="Shuffle"
              >
                <span className="material-symbols-outlined">
                  shuffle
                </span>
              </button>

              <button
                type="button"
                onClick={previousTrack}
                title="Previous"
              >
                <span className="material-symbols-outlined">
                  skip_previous
                </span>
              </button>

              <button
                type="button"
                className="large-play"
                onClick={togglePlay}
                title={
                  isPlaying
                    ? "Pause"
                    : "Play"
                }
              >
                <span className="material-symbols-outlined">
                  {isPlaying
                    ? "pause"
                    : "play_arrow"}
                </span>
              </button>

              <button
                type="button"
                onClick={nextTrack}
                title="Next"
              >
                <span className="material-symbols-outlined">
                  skip_next
                </span>
              </button>

              <button
                type="button"
                className={
                  repeatMode !== "off"
                    ? "active"
                    : ""
                }
                onClick={cycleRepeat}
                title="Repeat"
              >
                <span className="material-symbols-outlined">
                  {repeatIcon}
                </span>
              </button>

              <button
                type="button"
                className={lyricsOpen ? "active" : ""}
                onClick={() => setLyricsOpen((value) => !value)}
                title="Lyrics"
              >
                <span className="material-symbols-outlined">
                  lyrics
                </span>
              </button>
            </div>

            {lyricsOpen && <LyricsSection />}

            <div className="sleep-timer">
              <div>
                <span className="material-symbols-outlined">
                  bedtime
                </span>

                <div>
                  <strong>
                    Sleep timer
                  </strong>

                  <small>
                    {sleepTimerMinutes
                      ? `${Math.ceil(
                          sleepRemaining /
                            60,
                        )} min remaining`
                      : "Stops playback without changing the queue"}
                  </small>
                </div>
              </div>

              <select
                value={
                  sleepTimerMinutes || 0
                }
                onChange={(event) => {
                  const value = Number(
                    event.target.value,
                  );

                  if (value === 0) {
                    clearSleepTimer();
                  } else {
                    setSleepTimer(value);
                  }
                }}
              >
                <option value="0">
                  Off
                </option>

                <option value="5">
                  5 minutes
                </option>

                <option value="10">
                  10 minutes
                </option>

                <option value="15">
                  15 minutes
                </option>

                <option value="30">
                  30 minutes
                </option>

                <option value="45">
                  45 minutes
                </option>

                <option value="60">
                  60 minutes
                </option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NowPlayingBar({ player }) {
  const [expanded, setExpanded] =
    useState(false);

  const [queueOpen, setQueueOpen] =
    useState(false);

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeatMode,
    togglePlay,
    nextTrack,
    previousTrack,
    toggleShuffle,
    cycleRepeat,
    seekTo,
  } = player;

  useEffect(() => {
    if (!currentTrack) {
      setExpanded(false);
      setQueueOpen(false);
    }
  }, [currentTrack]);

  if (!currentTrack) return null;

  return (
    <>
      {queueOpen && !expanded && (
        <QueuePanel
          player={player}
          onClose={() =>
            setQueueOpen(false)
          }
        />
      )}

      {expanded && (
        <ExpandedPlayer
          player={player}
          onClose={() =>
            setExpanded(false)
          }
        />
      )}

      <div className="now-playing-bar">
        <button
          className="now-playing-track"
          type="button"
          onClick={() =>
            setExpanded(true)
          }
          title="Open now playing"
        >
          <img
            src={getCover(currentTrack)}
            alt=""
          />

          <span>
            <strong>
              {currentTrack.name}
            </strong>

            <small>
              {getArtist(currentTrack)}
            </small>
          </span>
        </button>

        <div className="now-playing-center">
          <div className="now-playing-controls">
            <button
              type="button"
              className={
                shuffle ? "active" : ""
              }
              onClick={toggleShuffle}
              title="Shuffle"
            >
              <span className="material-symbols-outlined">
                shuffle
              </span>
            </button>

            <button
              type="button"
              onClick={previousTrack}
              title="Previous"
            >
              <span className="material-symbols-outlined">
                skip_previous
              </span>
            </button>

            <button
              type="button"
              className="now-playing-play"
              onClick={togglePlay}
              title={
                isPlaying
                  ? "Pause"
                  : "Play"
              }
            >
              <span className="material-symbols-outlined">
                {isPlaying
                  ? "pause"
                  : "play_arrow"}
              </span>
            </button>

            <button
              type="button"
              onClick={nextTrack}
              title="Next"
            >
              <span className="material-symbols-outlined">
                skip_next
              </span>
            </button>

            <button
              type="button"
              className={
                repeatMode !== "off" ? "active" : ""
              }
              onClick={cycleRepeat}
              title="Repeat"
            >
              <span className="material-symbols-outlined">
                {repeatMode === "one" ? "repeat_one" : "repeat"}
              </span>
            </button>

            <button
              type="button"
              className={
                queueOpen ? "active" : ""
              }
              onClick={() =>
                setQueueOpen(!queueOpen)
              }
              title="Queue"
            >
              <span className="material-symbols-outlined">
                queue_music
              </span>
            </button>
          </div>

          <div className="now-playing-progress">
            <span>
              {formatTime(currentTime)}
            </span>

            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={Math.min(
                currentTime,
                duration || 0,
              )}
              onChange={(event) =>
                seekTo(
                  Number(
                    event.target.value,
                  ),
                )
              }
            />

            <span>
              {formatTime(duration)}
            </span>
          </div>
        </div>

        <button
          className="now-playing-open"
          type="button"
          onClick={() =>
            setExpanded(true)
          }
          title="Open now playing"
        >
          <span className="material-symbols-outlined">
            open_in_full
          </span>
        </button>
      </div>
    </>
  );
}

export default NowPlayingBar;