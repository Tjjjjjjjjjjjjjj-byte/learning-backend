import { Routes, Route } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import Home from './pages/home.jsx'
import LoginPage from './pages/loginPage.jsx'
import Profile from './pages/profile.jsx'
import SearchPage from './pages/searchPage.jsx'
import SignUpPage from './pages/signUpPage.jsx'
import ForgotPasswordPage from './pages/forgotPasswordPage.jsx'
import ResetPasswordPage from './pages/resetPasswordPage.jsx'

export const SEARCH_QUEUE_ID = "search-queue";

function App() {
  const [current, setCurrent] = useState(null);
  const [currentPlaylistId, setCurrentPlaylistId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTracks, setPlaybackTracks] = useState([]);
  const [playbackPlaylistId, setPlaybackPlaylistId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef(null);
  const currentRef = useRef(null);
  const tracksRef = useRef([]);
  const sourceRequestRef = useRef(0);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    tracksRef.current = playbackTracks;
  }, [playbackTracks]);

  useEffect(() => {
    if (!currentPlaylistId) {
      setPlaybackTracks([]);
      setPlaybackPlaylistId(null);
      return;
    }

    if (currentPlaylistId === SEARCH_QUEUE_ID) {
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

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load playback tracks");
        }

        if (!cancelled) {
          setPlaybackTracks(data.filter(Boolean));
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
  }, [currentPlaylistId]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    function handleTimeUpdate() {
      setCurrentTime(audio.currentTime);
    }

    function handleLoadedMetadata() {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
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
    }

    function handleError() {
      console.error("AUDIO PLAYBACK ERROR:", audio.error);
      setIsPlaying(false);
    }

    function handleEnded() {
      const tracks = tracksRef.current;
      const currentId = currentRef.current;

      const currentIndex = tracks.findIndex(
        (track) => track.id === currentId,
      );

      if (currentIndex === -1) {
        setIsPlaying(false);
        return;
      }

      const nextTrack = tracks[currentIndex + 1];

      if (!nextTrack) {
        setIsPlaying(false);
        setCurrent(null);
        setCurrentTime(0);
        setDuration(0);
        return;
      }

      setCurrent(nextTrack.id);
      setIsPlaying(true);
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
    const audio = audioRef.current;

    if (!audio) return;

    const selectedTrack =
      playbackPlaylistId === currentPlaylistId
        ? playbackTracks.find((track) => track.id === current)
        : null;

    const requestId = sourceRequestRef.current + 1;
    sourceRequestRef.current = requestId;
    const controller = new AbortController();

    if (!current || !selectedTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      setCurrentTime(0);
      setDuration(0);

      return () => {
        controller.abort();
      };
    }

    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    setCurrentTime(0);
    setDuration(0);

    async function loadAudioSource() {
      try {
        let audioUrl;

        if (selectedTrack.downloaded) {
          audioUrl = `http://localhost:3000/song/file/${encodeURIComponent(
            selectedTrack.id,
          )}`;
        } else {
          const name = encodeURIComponent(selectedTrack.name || "");
          const artist = encodeURIComponent(
            selectedTrack.artists?.[0]?.name || "",
          );

          const response = await fetch(
            `http://localhost:3000/song/stream/${encodeURIComponent(
              selectedTrack.id,
            )}?name=${name}&artist=${artist}`,
            {
              credentials: "include",
              signal: controller.signal,
            },
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Failed to get audio URL");
          }

          if (!data.url || typeof data.url !== "string") {
            throw new Error("Backend returned no playable audio URL");
          }

          audioUrl = data.url;
        }

        if (
          controller.signal.aborted ||
          sourceRequestRef.current !== requestId
        ) {
          return;
        }

        audio.src = audioUrl;
        audio.load();

        if (!isPlayingRef.current) {
          return;
        }

        if (audio.readyState < 3) {
          await new Promise((resolve, reject) => {
            const handleCanPlay = () => {
              cleanup();
              resolve();
            };

            const handleError = () => {
              cleanup();
              reject(
                new Error("Audio element could not load the assigned source"),
              );
            };

            const cleanup = () => {
              audio.removeEventListener("canplay", handleCanPlay);
              audio.removeEventListener("error", handleError);
            };

            audio.addEventListener("canplay", handleCanPlay, {
              once: true,
            });

            audio.addEventListener("error", handleError, {
              once: true,
            });
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

        console.error("AUDIO SOURCE/PLAY FAILED:", error);
        setIsPlaying(false);
      }
    }

    loadAudioSource();

    return () => {
      controller.abort();
    };
  }, [
    current,
    currentPlaylistId,
    playbackTracks,
    playbackPlaylistId,
  ]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    if (!isPlaying) {
      audio.pause();
      return;
    }

    if (!audio.src) {
      return;
    }

    audio.play().catch((error) => {
      console.error("AUDIO PLAY FAILED:", error);
      setIsPlaying(false);
    });
  }, [isPlaying]);

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
  };

  return (
    <>
      <audio
        ref={audioRef}
        preload="metadata"
        hidden
      />

      <Routes>
        <Route path="/home" element={<Home player={player} />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/search" element={<SearchPage player={player} />} />
        <Route path="/signUpPage" element={<SignUpPage />} />
        <Route path="/forgotPasswordPage" element={<ForgotPasswordPage />} />
        <Route path="/resetPasswordPage" element={<ResetPasswordPage />} />
      </Routes>
    </>
  )
}

export default App