import { useState } from "react";
import CreateNewPlaylist from "./playlists/createnewplaylist";
import Minimize from "./playlists/minimize";
import Playlist from "./playlists/playlistComponent";
import Maximize from "./playlists/maximize";
import "../styling/sidebar.css";
function PlaylistSidebar() {
  const [createOptionsHidden, setCreateOptionsHidden] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [maximized, setMaximized] = useState(false);
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
      <Playlist minimized={minimized} maximized={maximized} />
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
      <Playlist minimized={minimized} maximized={maximized} />
    </aside>
  );
}
export default PlaylistSidebar;
