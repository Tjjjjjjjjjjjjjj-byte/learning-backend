import { useEffect, useState } from "react";
import { ReactSVG } from "react-svg";

function CreateNewPlaylist({ minimized, maximized, onCreatePlaylist }) {
  const [hidden, setHidden] = useState(true);
  const [hoveredButton, setHoveredButton] = useState(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        !event.target.closest(".createOptions") &&
        !event.target.closest(".createPlaylist-btn")
      ) {
        setHidden(true);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleCreate() {
    try {
      const response = await fetch("http://localhost:3000/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create playlist");
      }

      setHidden(true);
      onCreatePlaylist?.(data.playlist);
    } catch (err) {
      console.error("Failed to create playlist:", err);
    }
  }

  return (
    <>
      {!minimized ? (
        <div className="playlistCreateDiv">
          <button
            className="createPlaylist-btn"
            onClick={() => setHidden(!hidden)}
          >
            <span className="material-symbols-outlined">add</span>
            <p className="createText">Create</p>
          </button>
        </div>
      ) : (
        <div className="minimized">
          <button
            className="createPlaylist-btn"
            onClick={() => setHidden(!hidden)}
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      )}

      <div className={hidden ? "createOptions hidden" : "createOptions"}>
        <button
          id="playlist"
          className="create-playlist"
          onMouseEnter={() => setHoveredButton("playlist")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={handleCreate}
        >
          <ReactSVG
            src={
              hoveredButton === "playlist"
                ? "/spotify-playlist-hovered.svg"
                : "/spotify-playlist.svg"
            }
          />
          <span className="create-option-title">Playlist</span>
          <p className="explanation">Create a playlist with songs or episodes</p>
        </button>

        <button
          id="blend"
          className="blend"
          disabled
          title="Blend creation is not available yet"
          onMouseEnter={() => setHoveredButton("blend")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          <ReactSVG
            src={
              hoveredButton === "blend"
                ? "/spotify-blend-hovering.svg"
                : "/spotify-blend.svg"
            }
          />
          <span className="create-option-title">Blend</span>
          <p className="explanation">Create a playlist with your friends</p>
        </button>

        <button
          id="folder"
          className="folder"
          disabled
          title="Folder creation is not available yet"
          onMouseEnter={() => setHoveredButton("folder")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          <ReactSVG
            src={
              hoveredButton === "folder"
                ? "/spotify-folder-hovered.svg"
                : "/spotify-folder.svg"
            }
          />
          <span className="create-option-title">Folder</span>
          <p className="explanation">Organize your playlists</p>
        </button>
      </div>
    </>
  );
}

export default CreateNewPlaylist;
