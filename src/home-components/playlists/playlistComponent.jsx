import { useState } from "react";

function Playlist({ minimized, maximized, viewMode = "list" }) {
  console.log("minimized:", minimized, "maximized:", maximized);
  let type = "Playlist";
  let author = "You";
  const [hovering, setHovering] = useState(false);
  if (!minimized || maximized) {
    return (
      <div
        className={
          viewMode === "grid"
            ? "playlistComponent-div grid-view"
            : "playlistComponent-div"
        }
      >
        <button
          className="playlist"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <img src="" alt="" />
          {hovering && (
            <span className="material-symbols-outlined">play_circle</span>
          )}
        </button>
        {!minimized && (
  <p className="playlist-info">
    {type} · {author}
  </p>
)}
      </div>
    );
  }
  return (
    <button
      className="playlist"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <img src="" alt="" />
      {hovering && (
        <span className="material-symbols-outlined">play_circle</span>
      )}
    </button>
  );
}
export default Playlist;
