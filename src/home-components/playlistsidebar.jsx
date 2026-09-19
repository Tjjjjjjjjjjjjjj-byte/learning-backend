import { useState, useEffect } from "react";
import CreateNewPlaylist from "./playlists/createnewplaylist";
import Minimize from "./playlists/minimize";
import Playlist from "./playlists/playlistComponent";
import Maximize from "./playlists/maximize";
import LibrarySort from "./playlists/librarySort";
import "../styling/sidebar.css";
import LibrarySearch from "./playlists/librarySearch";

function PlaylistSidebar() {
  const [createOptionsHidden, setCreateOptionsHidden] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("Recents");
  const [viewMode, setViewMode] = useState("list");
  const [query, setQuery] = useState("");

  const fetchPlaylists = () => {
    setLoading(true);
    fetch("http://localhost:3000/home", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        setPlaylists(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load playlists:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const searchedPlaylist = playlists.filter((playlist) =>
    playlist.name.toLowerCase().includes(query.toLowerCase()),
  );

  if (sort === "Alphabetical") {
    searchedPlaylist.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "Creator") {
    searchedPlaylist.sort((a, b) => a.owner.localeCompare(b.owner));
  }
  // "Recents" / "Recently Added" fall back to the order the backend
  // returns — there's no timestamp field on a playlist yet to sort by.

  const listClassName =
    !minimized && viewMode === "grid" ? "library-list grid-mode" : "library-list";

  const list = (
    <div className={listClassName}>
      {searchedPlaylist.map((playlist) => (
        <Playlist
          key={playlist.id}
          minimized={minimized}
          maximized={maximized}
          viewMode={viewMode}
          name={playlist.name}
          owner={playlist.owner}
        />
      ))}
      {!loading && !minimized && searchedPlaylist.length === 0 && (
        <p className="library-empty">
          {query ? "No playlists found." : "No playlists yet — create one to get started."}
        </p>
      )}
      {loading && !minimized && <p className="library-empty">Loading your library…</p>}
    </div>
  );

  return !maximized ? (
    <aside className={minimized ? "sidebar minimized" : "sidebar"}>
      <Minimize setMinimized={setMinimized} minimized={minimized} />
      <CreateNewPlaylist
        minimized={minimized}
        maximized={maximized}
        createOptionsHidden={createOptionsHidden}
        setCreateOptionsHidden={setCreateOptionsHidden}
        onCreatePlaylist={fetchPlaylists}
      />
      <Maximize
        minimized={minimized}
        setMaximized={setMaximized}
        maximized={maximized}
      />
      {list}
    </aside>
  ) : (
    <aside className="maximized">
      <Minimize
        setMinimized={setMinimized}
        minimized={minimized}
        maximized={maximized}
      />
      <CreateNewPlaylist
        minimized={minimized}
        maximized={maximized}
        createOptionsHidden={createOptionsHidden}
        setCreateOptionsHidden={setCreateOptionsHidden}
        onCreatePlaylist={fetchPlaylists}
      />
      <Maximize
        minimized={minimized}
        setMaximized={setMaximized}
        maximized={maximized}
      />
      <LibrarySort
        minimized={minimized}
        maximized={maximized}
        sort={sort}
        setSort={setSort}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />
      <LibrarySearch
        minimized={minimized}
        maximized={maximized}
        query={query}
        setQuery={setQuery}
      />
      <div className="library-table-header">
        <span>Title</span>
        <span>Date Added</span>
        <span>Played</span>
      </div>
      {list}
    </aside>
  );
}
export default PlaylistSidebar;