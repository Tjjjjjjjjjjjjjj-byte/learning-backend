import Nav from "../home-components/nav";
import PlaylistSidebar from "../home-components/playlistsidebar";
import PlaylistModal from "../home-components/playlistTrueComponent";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "../styling/home.css";

function Home() {
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [minimized, setMinimized] = useState(true);
  const [current, setCurrent] = useState(null);
  const [currentPlaylistId, setCurrentPlaylistId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTracks, setPlaybackTracks] = useState([]);
  const [playbackPlaylistId, setPlaybackPlaylistId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const navigate = useNavigate();

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
    async function checkLogIn() {
      try {
        const response = await fetch("http://localhost:3000/me", {
          method: "GET",
          credentials: "include",
        });

        if (response.status !== 200) {
          navigate("/login", { replace: true });
        }
      } catch (error) {
        console.error("Session check failed:", error);
      }
    }

    checkLogIn();
  }, [navigate]);

  useEffect(() => {
    if (!currentPlaylistId) {
      setPlaybackTracks([]);
      setPlaybackPlaylistId(null);
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

  return (
    <div
      className={`home-div${
        minimized ? " sidebar-minimized" : " sidebar-expanded"
      }`}
    >
      <audio
        ref={audioRef}
        crossOrigin="use-credentials"
        preload="metadata"
        hidden
      />

      <Nav setSelectedPlaylist={setSelectedPlaylist} />

      <PlaylistSidebar
        selectedPlaylist={selectedPlaylist}
        setSelectedPlaylist={setSelectedPlaylist}
        minimized={minimized}
        setMinimized={setMinimized}
        currentPlaylistId={currentPlaylistId}
        setCurrent={setCurrent}
        setCurrentPlaylistId={setCurrentPlaylistId}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
      />

      {selectedPlaylist && (
        <PlaylistModal
          selectedPlaylist={selectedPlaylist}
          setSelectedPlaylist={setSelectedPlaylist}
          minimized={minimized}
          setCurrent={setCurrent}
          current={current}
          currentPlaylistId={currentPlaylistId}
          setCurrentPlaylistId={setCurrentPlaylistId}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          setPlaybackTracks={setPlaybackTracks}
        />
      )}
    </div>
  );
}

export default Home;