import { useEffect, useState } from "react";
import CreateNewPlaylist from "./playlists/createnewplaylist";
import Minimize from "./playlists/minimize";
import Playlist from "./playlists/playlistComponent";
import Maximize from "./playlists/maximize";
import LibrarySort from "./playlists/librarySort";
import "../styling/sidebar.css";
import "../styling/sidebar-animations.css";
import "../styling/playlistModal.css";
import LibrarySearch from "./playlists/librarySearch";

function PlaylistSidebar({
  selectedPlaylist,
  setSelectedPlaylist,
  minimized,
  setMinimized,
  currentPlaylistId,
  setCurrent,
  setCurrentPlaylistId,
  isPlaying,
  setIsPlaying,
}) {
  const [createOptionsHidden, setCreateOptionsHidden] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("Recents");
  const [viewMode, setViewMode] = useState("list");
  const [query, setQuery] = useState("");

  const fetchPlaylists = async () => {
    setLoading(true);

    try {
      const response = await fetch("http://localhost:3000/home", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setPlaylists(data.playlists || []);
    } catch (err) {
      console.error("Failed to load playlists:", err);
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  useEffect(() => {
    if (!selectedPlaylist) return;

    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.id === selectedPlaylist.id
          ? { ...playlist, ...selectedPlaylist, _openEdit: undefined }
          : playlist,
      ),
    );
  }, [selectedPlaylist]);

  function handlePlaylistCreated(createdPlaylist) {
    fetchPlaylists();
    setMaximized(false);

    if (createdPlaylist) {
      setSelectedPlaylist({
        ...createdPlaylist,
        _openEdit: true,
      });
    }
  }

  function handlePlaylistDeleted(id) {
    setPlaylists((current) =>
      current.filter((playlist) => playlist.id !== id),
    );
  }

  const searchedPlaylist = playlists.filter((playlist) =>
    (playlist.name || "").toLowerCase().includes(query.toLowerCase()),
  );

  if (sort === "Alphabetical") {
    searchedPlaylist.sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
  } else if (sort === "Creator") {
    searchedPlaylist.sort((a, b) =>
      (a.owner || "").localeCompare(b.owner || ""),
    );
  }

  const listClassName =
    !minimized && viewMode === "grid"
      ? "library-list grid-mode"
      : "library-list";

  const list = (
    <div className={listClassName}>
      {searchedPlaylist.map((playlist) => (
        <Playlist
          key={playlist.id}
          minimized={minimized}
          maximized={maximized}
          setMaximized={setMaximized}
          viewMode={viewMode}
          name={playlist.name}
          owner={playlist.owner}
          cover={playlist.cover}
          status={playlist.status}
          description={playlist.description}
          id={playlist.id}
          selectedPlaylist={selectedPlaylist}
          setSelectedPlaylist={setSelectedPlaylist}
          currentPlaylistId={currentPlaylistId}
          setCurrent={setCurrent}
          setCurrentPlaylistId={setCurrentPlaylistId}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          onPlaylistDeleted={handlePlaylistDeleted}
        />
      ))}

      {!loading && !minimized && searchedPlaylist.length === 0 && (
        <p className="library-empty">
          {query
            ? "No playlists found."
            : "No playlists yet — create one to get started."}
        </p>
      )}

      {loading && !minimized && (
        <p className="library-empty">Loading your library…</p>
      )}
    </div>
  );

  return !maximized ? (
    <aside className={minimized ? "sidebar minimized" : "sidebar"}>
      <Minimize
        setMinimized={setMinimized}
        minimized={minimized}
        setViewMode={setViewMode}
      />

      <CreateNewPlaylist
        minimized={minimized}
        maximized={maximized}
        onCreatePlaylist={handlePlaylistCreated}
      />

      <Maximize
        minimized={minimized}
        setMaximized={setMaximized}
        maximized={maximized}
        setSelectedPlaylist={setSelectedPlaylist}
        selectedPlaylist={selectedPlaylist}
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
        onCreatePlaylist={handlePlaylistCreated}
      />

      <Maximize
        minimized={minimized}
        setMaximized={setMaximized}
        maximized={maximized}
        setSelectedPlaylist={setSelectedPlaylist}
        selectedPlaylist={selectedPlaylist}
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
      </div>

      {list}
    </aside>
  );
}

export default PlaylistSidebar;
