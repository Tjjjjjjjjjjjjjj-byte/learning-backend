import Nav from "../home-components/nav";
import PlaylistSidebar from "../home-components/playlistsidebar";
import PlaylistModal from "../home-components/playlistTrueComponent";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import "../styling/home.css";

function Home({ player }) {
  const [selectedPlaylist, setSelectedPlaylist] =
    useState(null);

  const [minimized, setMinimized] =
    useState(true);

  const [searchParams, setSearchParams] = useSearchParams();

  const {
    current,
    setCurrent,
    currentPlaylistId,
    setCurrentPlaylistId,
    isPlaying,
    setIsPlaying,
    setPlaybackTracks,
    setPlaybackPlaylistId,
    addToQueue,
    playNext,
  } = player;

  const navigate = useNavigate();

  useEffect(() => {
    async function checkLogIn() {
      try {
        const response = await fetch(
          "http://localhost:3000/me",
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (response.status !== 200) {
          navigate("/login", {
            replace: true,
          });
        }
      } catch (error) {
        console.error(
          "Session check failed:",
          error,
        );
      }
    }

    checkLogIn();
  }, [navigate]);

  useEffect(() => {
    const spotifyPlaylistId = searchParams.get("spotifyPlaylist");

    if (!spotifyPlaylistId) {
      return;
    }

    let cancelled = false;

    async function openPublicPlaylist() {
      try {
        const response = await fetch(
          `http://localhost:3000/spotify/playlist/${encodeURIComponent(
            spotifyPlaylistId,
          )}`,
          { credentials: "include" },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load Spotify playlist");
        }

        if (!cancelled) {
          setSelectedPlaylist(data);
          setSearchParams({}, { replace: true });
        }
      } catch (error) {
        console.error("FAILED TO OPEN PUBLIC SPOTIFY PLAYLIST:", error);

        if (!cancelled) {
          setSearchParams({}, { replace: true });
        }
      }
    }

    openPublicPlaylist();

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  return (
    <div
      className={`home-div${
        minimized
          ? " sidebar-minimized"
          : " sidebar-expanded"
      }`}
    >
      <Nav
        setSelectedPlaylist={
          setSelectedPlaylist
        }
      />

      <PlaylistSidebar
        selectedPlaylist={
          selectedPlaylist
        }
        setSelectedPlaylist={
          setSelectedPlaylist
        }
        minimized={minimized}
        setMinimized={setMinimized}
        currentPlaylistId={
          currentPlaylistId
        }
        setCurrent={setCurrent}
        setCurrentPlaylistId={
          setCurrentPlaylistId
        }
        setPlaybackTracks={setPlaybackTracks}
        setPlaybackPlaylistId={setPlaybackPlaylistId}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
      />

      {selectedPlaylist && (
        <PlaylistModal
          selectedPlaylist={
            selectedPlaylist
          }
          setSelectedPlaylist={
            setSelectedPlaylist
          }
          minimized={minimized}
          setCurrent={setCurrent}
          current={current}
          currentPlaylistId={
            currentPlaylistId
          }
          setCurrentPlaylistId={
            setCurrentPlaylistId
          }
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          setPlaybackTracks={
            setPlaybackTracks
          }
          setPlaybackPlaylistId={
            setPlaybackPlaylistId
          }
          onAddToQueue={addToQueue}
          onPlayNext={playNext}
        />
      )}
    </div>
  );
}

export default Home;