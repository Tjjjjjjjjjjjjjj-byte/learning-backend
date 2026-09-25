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

    // The search page builds and sets playbackTracks itself (it isn't
    // a real playlist id to fetch from the backend) — nothing to do here.
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

    if (!current || !selectedTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      setCurrentTime(0);
      setDuration(0);

      return;
    }

    const name = encodeURIComponent(selectedTrack.name || "");

    const artist = encodeURIComponent(
      selectedTrack.artists?.[0]?.name || "",
    );

    const sourceUrl =
      `http://localhost:3000/song/stream/${encodeURIComponent(selectedTrack.id)}` +
      `?name=${name}&artist=${artist}`;

    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    setCurrentTime(0);
    setDuration(0);

    audio.src = sourceUrl;
    audio.load();

    if (isPlayingRef.current) {
      audio.play().catch((error) => {
        if (sourceRequestRef.current !== requestId) return;

        console.error("AUDIO PLAY FAILED:", error);
        setIsPlaying(false);
      });
    }
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

    if (!audio.src || !current) {
      return;
    }

    audio.play().catch((error) => {
      console.error("AUDIO PLAY FAILED:", error);
      setIsPlaying(false);
    });
  }, [isPlaying, current]);

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
        crossOrigin="use-credentials"
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