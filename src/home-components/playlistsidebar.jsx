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
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("http://localhost:3000/home", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        setPlaylists(data);
      });
  }, []);

  const searchedPlaylist = playlists.filter(playlist =>
    playlist.name.toLowerCase().includes(query.toLowerCase())
  );

  return !maximized ? (
    <aside className={minimized ? "sidebar minimized" : "sidebar"}>
      <Minimize setMinimized={setMinimized} minimized={minimized} />
      <CreateNewPlaylist
        minimized={minimized}
        maximized={maximized}
        createOptionsHidden={createOptionsHidden}
        setCreateOptionsHidden={setCreateOptionsHidden}
      />
      <Maximize
        minimized={minimized}
        setMaximized={setMaximized}
        maximized={maximized}
      />
      {searchedPlaylist.map((playlist) => (
        <Playlist
          key={playlist.id}
          minimized={minimized}
          maximized={maximized}
          name={playlist.name}
          owner={playlist.owner}
        />
      ))}
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
      />
      <Maximize
        minimized={minimized}
        setMaximized={setMaximized}
        maximized={maximized}
      />
      <LibrarySort className="library-filters" />
      <LibrarySearch className="library-search" query={query} setQuery={setQuery} />
      <div className="library-table-header">
        <span>Title</span>
        <span>Date Added</span>
        <span>Played</span>
      </div>
      {searchedPlaylist.map((playlist) => (
        <Playlist
          key={playlist.id}
          minimized={minimized}
          maximized={maximized}
          name={playlist.name}
          owner={playlist.owner}
        />
      ))}
    </aside>
  );
}
export default PlaylistSidebar;
