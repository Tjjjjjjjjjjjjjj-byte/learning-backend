import { useState } from "react";
import CreateNewPlaylist from "./playlists/createnewplaylist";
import Minimize from "./playlists/minimize";
import Playlist from "./playlists/playlistComponent";
import Maximize from "./playlists/maximize";
import "../styling/sidebar.css";
function PlaylistSidebar() {
  const [createOptionsHidden, setCreateOptionsHidden] = useState(false)
  const [minimized, setMinimized] = useState(true);
  const [maximized, setMaximized] = useState(false);
  return (
    <aside className={minimized ? "sidebar minimized" : "sidebar"}>
      <Minimize setMinimized={setMinimized} minimized={minimized} />
      <CreateNewPlaylist minimized={minimized} maximized={maximized} createOptionsHidden={createOptionsHidden} setCreateOptionsHidden={setCreateOptionsHidden}/>
      <Playlist minimized={minimized} maximized={maximized}/>
      <Maximize minimized={minimized} setMaximized={setMaximized} maximized={maximized}/>
    </aside>
  );
}
export default PlaylistSidebar;