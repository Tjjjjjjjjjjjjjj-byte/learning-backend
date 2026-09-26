import { Routes, Route } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Home from "./pages/home.jsx";
import LoginPage from "./pages/loginPage.jsx";
import Profile from "./pages/profile.jsx";
import SearchPage from "./pages/searchPage.jsx";
import SignUpPage from "./pages/signUpPage.jsx";
import ForgotPasswordPage from "./pages/forgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/resetPasswordPage.jsx";
import NowPlayingBar from "./home-components/nowplayingbar.jsx";
import "./styling/nowplaying.css";

export const SEARCH_QUEUE_ID = "search-queue";
export const FREE_QUEUE_ID = "free-queue";

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!text) return {};

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      response.ok
        ? "Server returned a non-JSON response"
        : `Server returned HTTP ${response.status} instead of JSON`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Server returned invalid JSON");
  }
}

function shuffleTracks(tracks, currentId) {
  const currentTrack = tracks.find((track) => track?.id === currentId);
  const remaining = tracks.filter((track) => track?.id !== currentId);

  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [remaining[index], remaining[randomIndex]] = [
      remaining[randomIndex],
      remaining[index],
    ];
  }

  return currentTrack ? [currentTrack, ...remaining] : remaining;
}

function App() {
  const [current, setCurrent] = useState(null);
  const [currentPlaylistId, setCurrentPlaylistId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTracks, setPlaybackTracks] = useState([]);
  const [playbackPlaylistId, setPlaybackPlaylistId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sourceRetry, setSourceRetry] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off");
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(0);
  const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);

  const audioRef = useRef(null);
  const currentRef = useRef(null);
  const tracksRef = useRef([]);
  const sourceRequestRef = useRef(0);
  const sourceRetryAttemptedRef = useRef(false);
  const sourceRetryInProgressRef = useRef(false);
  const isPlayingRef = useRef(false);
  const repeatModeRef = useRef(repeatMode);
  const originalQueueRef = useRef([]);
  const restorePositionRef = useRef(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const restoredForSessionRef = useRef(false);
  const restoringCurrentRef = useRef(false);
  const persistPlaybackRef = useRef(null);
  const sourceUrlRef = useRef("");
  const location = useLocation();

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    sourceRetryAttemptedRef.current = false;
  }, [current]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    tracksRef.current = playbackTracks;
  }, [playbackTracks]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  async function persistPlayback(event = "progress", overrides = {}) {
    const track = overrides.track || tracksRef.current.find(
      (item) => item?.id === currentRef.current,
    );

    if (!track?.id || !track?.name) return;

    const position = Number.isFinite(Number(overrides.position))
      ? Math.max(0, Number(overrides.position))
      : Math.max(0, Number(currentTimeRef.current) || 0);

    const durationValue = Number.isFinite(Number(overrides.duration))
      ? Math.max(0, Number(overrides.duration))
      : Math.max(0, Number(durationRef.current || track.duration_ms / 1000)) || 0;

    const queueIndex = tracksRef.current.findIndex((item) => item?.id === track.id);

    const state = {
      trackId: track.id,
      title: track.name,
      artist: track.artists?.map((artist) => artist?.name).filter(Boolean).join(", ") || "Unknown artist",
      album: track.album?.name || "",
      artwork: track.album?.images?.[0]?.url || "",
      duration: durationValue,
      source: track.downloaded ? "download" : "youtube-playback",
      sourceUrl: sourceUrlRef.current || (track.downloaded
        ? `http://localhost:3000/song/file/${encodeURIComponent(track.id)}`
        : `http://localhost:3000/song/stream/${encodeURIComponent(track.id)}`),
      position,
      updatedAt: new Date().toISOString(),
      completed: Boolean(overrides.completed),
      playlistId: currentPlaylistId,
      playlistName: overrides.playlistName || "",
      queueIndex: queueIndex >= 0 ? queueIndex : null,
    };

    try {
      const response = await fetch("http://localhost:3000/playback/state", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, event }),
        keepalive: event === "unload" || event === "pause" || event === "seek",
      });

      if (!response.ok) {
        const data = await readJsonResponse(response).catch(() => ({}));
        throw new Error(data.message || `Playback state save failed (${response.status})`);
      }
    } catch (error) {
      console.error("PLAYBACK STATE SAVE ERROR:", error);
    }
  }

  persistPlaybackRef.current = persistPlayback;

  useEffect(() => {
    let cancelled = false;

    async function restorePlayback() {
      if (restoredForSessionRef.current) return;

      try {
        const response = await fetch("http://localhost:3000/playback/state", {
          credentials: "include",
        });

        if (response.status === 401) return;

        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.message || "Failed to restore playback state");
        }

        if (cancelled) return;

        const state = data.state;
        if (!state?.trackId || !state?.title) {
          restoredForSessionRef.current = true;
          return;
        }

        const restoredTrack = {
          id: state.trackId,
          name: state.title,
          artists: [{ name: state.artist || "Unknown artist" }],
          album: {
            name: state.album || "",
            images: state.artwork ? [{ url: state.artwork }] : [],
          },
          duration_ms: Number(state.duration) > 0 ? Number(state.duration) * 1000 : 0,
          downloaded: state.source === "download",
        };

        restorePositionRef.current = {
          trackId: state.trackId,
          position: Math.max(0, Number(state.position) || 0),
        };

        restoringCurrentRef.current = true;
        setPlaybackTracks([restoredTrack]);
        setPlaybackPlaylistId(state.playlistId || FREE_QUEUE_ID);
        setCurrentPlaylistId(state.playlistId || FREE_QUEUE_ID);
        setCurrent(state.trackId);
        setCurrentTime(Math.max(0, Number(state.position) || 0));
        setDuration(Math.max(0, Number(state.duration) || 0));
        setIsPlaying(false);
        restoredForSessionRef.current = true;
      } catch (error) {
        console.error("PLAYBACK STATE RESTORE ERROR:", error);
      }
    }

    restorePlayback();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!current) return;

    if (restoringCurrentRef.current) {
      restoringCurrentRef.current = false;
      return;
    }

    persistPlaybackRef.current?.("track-change", {
      position: restorePositionRef.current?.trackId === current
        ? restorePositionRef.current.position
        : 0,
    });

    if (restorePositionRef.current?.trackId === current) {
      setCurrentTime(restorePositionRef.current.position);
    }
  }, [current]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (currentRef.current && isPlayingRef.current) {
        persistPlaybackRef.current?.("progress");
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleUnload = () => {
      if (currentRef.current) {
        persistPlaybackRef.current?.("unload");
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  const playbackPreloadKey = playbackTracks
    .map((track) => track?.id)
    .filter(Boolean)
    .sort()
    .join("|");

  useEffect(() => {
    const tracks = playbackTracks
      .filter(
        (track) =>
          track?.id &&
          track?.name &&
          track?.artists?.[0]?.name &&
          !track.downloaded,
      )
      .map((track) => ({
        id: track.id,
        name: track.name,
        artist: track.artists[0].name,
        duration_ms: Number(track.duration_ms) || null,
      }));

    if (!tracks.length) {
      return;
    }

    const controller = new AbortController();

    async function preloadPlaybackUrls() {
      try {
        const response = await fetch(
          "http://localhost:3000/song/preload",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ tracks }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const data = await readJsonResponse(response).catch(() => ({}));

          throw new Error(
            data.message ||
              "Failed to preload playback URLs",
          );
        }
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        console.error(
          "PLAYBACK URL PRELOAD ERROR:",
          error,
        );
      }
    }

    preloadPlaybackUrls();

    return () => controller.abort();
  }, [playbackPreloadKey]);

  useEffect(() => {
    if (
      !currentPlaylistId ||
      currentPlaylistId === SEARCH_QUEUE_ID ||
      currentPlaylistId === FREE_QUEUE_ID
    ) {
      return;
    }

    if (playbackPlaylistId === currentPlaylistId) {
      return;
    }

    let cancelled = false;

    async function getPlaybackTracks() {
      try {
        const response = await fetch(
          `http://localhost:3000/home/playlist/${currentPlaylistId}/tracks`,
          {
            credentials: "include",
          },
        );

        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.message || "Failed to load playback tracks");
        }

        if (!cancelled) {
          const nextTracks = data.filter(Boolean);

          originalQueueRef.current = nextTracks;

          setPlaybackTracks(
            shuffle
              ? shuffleTracks(
                  nextTracks,
                  currentRef.current,
                )
              : nextTracks,
          );

          setPlaybackPlaylistId(currentPlaylistId);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("FAILED TO LOAD PLAYBACK TRACKS:", error);
          setPlaybackTracks([]);
          setPlaybackPlaylistId(null);
        }
      }
    }

    getPlaybackTracks();

    return () => {
      cancelled = true;
    };
  }, [
    currentPlaylistId,
    playbackPlaylistId,
    playbackTracks.length,
    shuffle,
  ]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    function handleTimeUpdate() {
      setCurrentTime(audio.currentTime);
    }

    function handleLoadedMetadata() {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(nextDuration);

      const restored = restorePositionRef.current;
      if (restored?.trackId === currentRef.current) {
        const nextPosition = Math.min(
          restored.position,
          nextDuration > 0 ? nextDuration : restored.position,
        );
        audio.currentTime = nextPosition;
        setCurrentTime(nextPosition);
        restorePositionRef.current = null;
      }
    }

    function handleDurationChange() {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      if (audio.ended) return;
      setIsPlaying(false);
      persistPlaybackRef.current?.("pause", { position: audio.currentTime });
    }

    function handleError() {
      const currentId = currentRef.current;
      const track = tracksRef.current.find(
        (item) => item?.id === currentId,
      );

      if (
        track &&
        !track.downloaded &&
        !sourceRetryAttemptedRef.current
      ) {
        sourceRetryAttemptedRef.current = true;
        sourceRetryInProgressRef.current = true;
        console.warn(
          "AUDIO SOURCE FAILED. RETRYING WITH A FRESH URL.",
        );
        setSourceRetry((value) => value + 1);
        setIsPlaying(true);
        return;
      }

      console.error(
        "AUDIO PLAYBACK ERROR:",
        audio.error,
      );
      setIsPlaying(false);
    }

    function handleEnded() {
      const tracks = tracksRef.current;
      const currentId = currentRef.current;
      const currentTrack = tracks.find((track) => track?.id === currentId);

      if (currentTrack && currentId) {
        persistPlaybackRef.current?.("ended", {
          track: currentTrack,
          position: audio.duration || currentTimeRef.current,
          duration: Number.isFinite(audio.duration) ? audio.duration : durationRef.current,
          completed: true,
        });
      }

      if (!tracks.length || !currentId) {
        setIsPlaying(false);
        return;
      }

      if (repeatModeRef.current === "one") {
        audio.currentTime = 0;
        setCurrentTime(0);
        persistPlaybackRef.current?.("track-change", {
          track: currentTrack,
          position: 0,
          completed: false,
        });

        audio.play().catch((error) => {
          console.error("REPEAT PLAY FAILED:", error);
          setIsPlaying(false);
        });
        return;
      }

      const currentIndex = tracks.findIndex((track) => track?.id === currentId);
      const nextIndex = currentIndex + 1;

      if (nextIndex < tracks.length) {
        setCurrent(tracks[nextIndex].id);
        setCurrentTime(0);
        setIsPlaying(true);
        return;
      }

      if (repeatModeRef.current === "all" && tracks.length > 0) {
        setCurrent(tracks[0].id);
        setCurrentTime(0);
        setIsPlaying(true);
        return;
      }

      setIsPlaying(false);
      setCurrentTime(audio.duration || currentTimeRef.current);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : durationRef.current);
    }

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    const selectedTrack = tracksRef.current.find(
      (track) => track?.id === current,
    );

    const requestId = sourceRequestRef.current + 1;
    sourceRequestRef.current = requestId;

    const controller = new AbortController();

    if (!current || !selectedTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      sourceUrlRef.current = "";
      setCurrentTime(0);
      setDuration(0);

      return () => controller.abort();
    }

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    sourceUrlRef.current = "";

    setCurrentTime(0);
    setDuration(0);

    const name = encodeURIComponent(selectedTrack.name || "");
    const artist = encodeURIComponent(
      selectedTrack.artists?.[0]?.name || "",
    );

    async function loadAudioSource() {
      try {
        const refreshQuery =
          sourceRetryAttemptedRef.current
            ? "&refresh=1"
            : "";

        const endpoint = selectedTrack.downloaded
          ? `http://localhost:3000/song/file/${encodeURIComponent(
              selectedTrack.id,
            )}`
          : `http://localhost:3000/song/stream/${encodeURIComponent(
              selectedTrack.id,
            )}?name=${name}&artist=${artist}&durationMs=${encodeURIComponent(
                selectedTrack.duration_ms || "",
              )}${refreshQuery}`;

        let source = endpoint;

        if (selectedTrack.downloaded) {
          audio.crossOrigin = "use-credentials";
        } else {
          audio.removeAttribute("crossorigin");
        }

        if (!selectedTrack.downloaded) {
          const response = await fetch(endpoint, {
            credentials: "include",
            signal: controller.signal,
          });

          const data = await readJsonResponse(response);

          if (!response.ok) {
            throw new Error(
              data.message || "Failed to get audio URL",
            );
          }

          if (!data.url || typeof data.url !== "string") {
            throw new Error(
              "Backend returned no playable audio URL",
            );
          }

          source = data.url;
        }

        if (
          controller.signal.aborted ||
          sourceRequestRef.current !== requestId
        ) {
          return;
        }

        audio.src = source;
        sourceUrlRef.current = source;
        audio.load();
        sourceRetryInProgressRef.current = false;

        if (restorePositionRef.current?.trackId === selectedTrack.id) {
          const restoredPosition = restorePositionRef.current.position;
          if (audio.readyState >= 1) {
            audio.currentTime = restoredPosition;
            setCurrentTime(restoredPosition);
            restorePositionRef.current = null;
          }
        }

        if (!isPlayingRef.current) return;

        if (audio.readyState < 3) {
          await new Promise((resolve, reject) => {
            const handleCanPlay = () => {
              cleanup();
              resolve();
            };

            const handleError = () => {
              cleanup();
              reject(
                new Error(
                  "Audio element could not load the assigned source",
                ),
              );
            };

            const cleanup = () => {
              audio.removeEventListener(
                "canplay",
                handleCanPlay,
              );

              audio.removeEventListener(
                "error",
                handleError,
              );
            };

            audio.addEventListener(
              "canplay",
              handleCanPlay,
              { once: true },
            );

            audio.addEventListener(
              "error",
              handleError,
              { once: true },
            );
          });
        }

        if (
          controller.signal.aborted ||
          sourceRequestRef.current !== requestId ||
          !isPlayingRef.current
        ) {
          return;
        }

        await audio.play();
      } catch (error) {
        if (controller.signal.aborted) return;

        if (
          sourceRetryInProgressRef.current &&
          sourceRequestRef.current !== requestId
        ) {
          return;
        }

        sourceRetryInProgressRef.current = false;

        console.error(
          "AUDIO SOURCE/PLAY FAILED:",
          error,
        );

        setIsPlaying(false);
      }
    }

    loadAudioSource();

    return () => controller.abort();
  }, [current, sourceRetry]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    if (!isPlaying) {
      audio.pause();
      return;
    }

    if (
      audio.src &&
      audio.readyState >= 2 &&
      audio.paused
    ) {
      audio.play().catch((error) => {
        console.error("PLAY FAILED:", error);
        setIsPlaying(false);
      });
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!sleepTimerEndsAt) {
      setSleepRemaining(0);
      return;
    }

    function updateTimer() {
      const remaining = Math.max(
        0,
        sleepTimerEndsAt - Date.now(),
      );

      setSleepRemaining(remaining);

      if (remaining <= 0) {
        setSleepTimerMinutes(0);
        setSleepTimerEndsAt(null);
        setSleepRemaining(0);
        setIsPlaying(false);
      }
    }

    updateTimer();

    const interval = window.setInterval(
      updateTimer,
      1000,
    );

    return () => window.clearInterval(interval);
  }, [sleepTimerEndsAt]);

  function togglePlay() {
    if (!current) return;

    setIsPlaying((value) => !value);
  }

  function nextTrack() {
    const tracks = tracksRef.current;

    if (!tracks.length) return;

    const index = tracks.findIndex(
      (track) => track?.id === current,
    );

    if (index === -1) {
      setCurrent(tracks[0].id);
      setIsPlaying(true);
      return;
    }

    if (index + 1 < tracks.length) {
      setCurrent(tracks[index + 1].id);
      setIsPlaying(true);
      return;
    }

    if (repeatModeRef.current === "all") {
      setCurrent(tracks[0].id);
      setIsPlaying(true);
      return;
    }

    setIsPlaying(false);
  }

  function previousTrack() {
    const audio = audioRef.current;

    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const tracks = tracksRef.current;

    const index = tracks.findIndex(
      (track) => track?.id === current,
    );

    if (index > 0) {
      setCurrent(tracks[index - 1].id);
      setIsPlaying(true);
    } else if (tracks.length > 0) {
      setCurrent(tracks[0].id);
      setIsPlaying(true);
    }
  }

  function toggleShuffle() {
    if (!shuffle) {
      originalQueueRef.current =
        tracksRef.current.map((track) => track);

      setPlaybackTracks(
        shuffleTracks(
          tracksRef.current,
          current,
        ),
      );

      setShuffle(true);
      return;
    }

    const original = originalQueueRef.current;

    if (original.length > 0) {
      const currentTrack = original.find(
        (track) => track?.id === current,
      );

      const remaining = original.filter(
        (track) => track?.id !== current,
      );

      setPlaybackTracks(
        currentTrack
          ? [currentTrack, ...remaining]
          : original,
      );
    }

    originalQueueRef.current = [];

    setShuffle(false);
  }

  function cycleRepeat() {
    setRepeatMode((mode) => {
      if (mode === "off") return "all";
      if (mode === "all") return "one";
      return "off";
    });
  }

  function playQueueTrack(trackId) {
    if (trackId === current) {
      setIsPlaying(true);
      return;
    }

    setCurrent(trackId);
    setIsPlaying(true);
  }

  function addToQueue(track) {
    if (!track?.id) return;

    setPlaybackTracks((tracks) => {
      if (
        tracks.some(
          (item) => item?.id === track.id,
        )
      ) {
        return tracks;
      }

      const next = [...tracks, track];

      if (shuffle) {
        originalQueueRef.current = [
          ...originalQueueRef.current.filter(
            (item) => item?.id !== track.id,
          ),
          track,
        ];
      }

      return next;
    });

    if (!current) {
      setPlaybackPlaylistId(FREE_QUEUE_ID);
      setCurrentPlaylistId(FREE_QUEUE_ID);
      setCurrent(track.id);
      setIsPlaying(true);
    }
  }

  function playNext(track) {
    if (!track?.id || track.id === current) return;

    setPlaybackTracks((tracks) => {
      const withoutTrack = tracks.filter(
        (item) => item?.id !== track.id,
      );

      const currentIndex = withoutTrack.findIndex(
        (item) => item?.id === current,
      );

      const next =
        currentIndex === -1
          ? [track, ...withoutTrack]
          : [
              ...withoutTrack.slice(0, currentIndex + 1),
              track,
              ...withoutTrack.slice(currentIndex + 1),
            ];

      if (shuffle) {
        originalQueueRef.current = next;
      }

      return next;
    });

    if (!current) {
      setPlaybackPlaylistId(FREE_QUEUE_ID);
      setCurrentPlaylistId(FREE_QUEUE_ID);
      setCurrent(track.id);
      setIsPlaying(true);
    }
  }

  function removeFromQueue(trackId) {
    if (trackId === current) return;

    setPlaybackTracks((tracks) =>
      tracks.filter(
        (track) => track?.id !== trackId,
      ),
    );

    if (shuffle) {
      originalQueueRef.current =
        originalQueueRef.current.filter(
          (track) => track?.id !== trackId,
        );
    }
  }

  function reorderQueue(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    setPlaybackTracks((tracks) => {
      const sourceIndex = tracks.findIndex(
        (track) => track?.id === sourceId,
      );

      const targetIndex = tracks.findIndex(
        (track) => track?.id === targetId,
      );

      if (
        sourceIndex === -1 ||
        targetIndex === -1 ||
        sourceId === current ||
        targetId === current
      ) {
        return tracks;
      }

      const next = [...tracks];
      const [movedTrack] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedTrack);

      if (shuffle) {
        originalQueueRef.current = next;
      }

      return next;
    });
  }

  function clearQueue() {
    const currentTrack =
      tracksRef.current.find(
        (track) => track?.id === current,
      );

    if (currentTrack) {
      setPlaybackTracks([currentTrack]);
      if (shuffle) {
        originalQueueRef.current = [currentTrack];
      }
      return;
    }

    setPlaybackTracks([]);
    originalQueueRef.current = [];
  }

  function seekTo(value) {
    const audio = audioRef.current;

    if (!audio || !Number.isFinite(value)) return;

    audio.currentTime = value;
    setCurrentTime(value);
    persistPlaybackRef.current?.("seek", { position: value });
  }

  function setSleepTimer(minutes) {
    const numericMinutes = Number(minutes);

    if (!numericMinutes) {
      clearSleepTimer();
      return;
    }

    setSleepTimerMinutes(numericMinutes);
    setSleepTimerEndsAt(
      Date.now() + numericMinutes * 60 * 1000,
    );
  }

  function clearSleepTimer() {
    setSleepTimerMinutes(0);
    setSleepTimerEndsAt(null);
    setSleepRemaining(0);
  }

  const currentTrack =
    playbackTracks.find(
      (track) => track?.id === current,
    ) || null;

  const player = {
    current,
    setCurrent,
    currentPlaylistId,
    setCurrentPlaylistId,
    isPlaying,
    setIsPlaying,
    playbackTracks,
    setPlaybackTracks,
    playbackPlaylistId,
    setPlaybackPlaylistId,
    currentTime,
    duration,
    currentTrack,
    shuffle,
    repeatMode,
    togglePlay,
    nextTrack,
    previousTrack,
    toggleShuffle,
    cycleRepeat,
    playQueueTrack,
    addToQueue,
    playNext,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    seekTo,
    sleepTimerMinutes,
    sleepRemaining,
    setSleepTimer,
    clearSleepTimer,
  };

  return (
    <>
      <audio
        ref={audioRef}
        preload="metadata"
        hidden
      />

      <Routes>
        <Route
          path="/home"
          element={<Home player={player} />}
        />

        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/profile"
          element={<Profile />}
        />

        <Route
          path="/search"
          element={<SearchPage player={player} />}
        />

        <Route
          path="/signUpPage"
          element={<SignUpPage />}
        />

        <Route
          path="/forgotPasswordPage"
          element={<ForgotPasswordPage />}
        />

        <Route
          path="/resetPasswordPage"
          element={<ResetPasswordPage />}
        />
      </Routes>

      <NowPlayingBar player={player} />
    </>
  );
}

export default App;