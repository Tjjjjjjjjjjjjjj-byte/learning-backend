import { useState } from "react";
import { ReactSVG } from "react-svg";

function CreateNewPlaylist({ minimized, maximized, onCreatePlaylist }) {
  const [hidden, setHidden] = useState(true);
  const [hoveredButton, setHoveredButton] = useState(null);

  const handleMouseEnter = (e) => {
    setHoveredButton(e.currentTarget.id);
  };

  const handleMouseLeave = () => {
    setHoveredButton(null);
  };

  async function handleCreate() {
    try {
      const response = await fetch("http://localhost:3000/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        setHidden(true);
        onCreatePlaylist?.();
      } else {
        console.error("Failed to create playlist:", response.status);
      }
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
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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
          <p className="explanation">
            Create a playlist with songs or episodes
          </p>
        </button>

        <button
          id="blend"
          className="blend"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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