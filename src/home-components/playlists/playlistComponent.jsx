// playlistComponent.jsx — receive it as props, no fetch, no handleData at all
import { useState } from "react";

function Playlist({ name, owner, minimized, maximized, viewMode = "list" }) {
  const [hovering, setHovering] = useState(false);

  if (!minimized || maximized) {
    return (
      <div className={viewMode === "grid" ? "playlistComponent-div grid-view" : "playlistComponent-div"}>
        <button
          className="playlist"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <img src="" alt="" />
          {hovering && <span className="material-symbols-outlined">play_circle</span>}
        </button>
        {!minimized && (
          <p className="playlist-info">
            {name} · {owner}
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
      {hovering && <span className="material-symbols-outlined">play_circle</span>}
    </button>
  );
}
export default Playlist;