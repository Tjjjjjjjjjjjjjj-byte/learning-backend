import Nav from "../home-components/nav";
import PlaylistSidebar from "../home-components/playlistsidebar";
import PlaylistModal from "../home-components/playlistTrueComponent";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "../styling/home.css";

function Home({ player }) {
  const [selectedPlaylist, setSelectedPlaylist] =
    useState(null);

  const [minimized, setMinimized] =
    useState(true);

  const {
    current,
    setCurrent,
    currentPlaylistId,
    setCurrentPlaylistId,
    isPlaying,
    setIsPlaying,
    setPlaybackTracks,
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
          onAddToQueue={addToQueue}
          onPlayNext={playNext}
        />
      )}
    </div>
  );
}

export default Home;