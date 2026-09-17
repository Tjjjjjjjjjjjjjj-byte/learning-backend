import { useState } from "react";
import CreateNewPlaylist from "./playlists/createnewplaylist";
import Minimize from "./playlists/minimize";
import Playlist from "./playlists/playlistComponent";
import Maximize from "./playlists/maximize";
function PlaylistSidebar() {
  const [minimized, setMinimized] = useState(true);
  const [maximized, setMaximized] = useState(false);
  return (
    <>
      <Minimize setMinimized={setMinimized} minimized={minimized} />
      <CreateNewPlaylist minimized={minimized} maximized={maximized} />
      <Playlist minimized={minimized} maximized={maximized}/>
      <Maximize minimized={minimized} setMaximized={setMaximized} maximized={maximized}/>
    </>
  );
}
export default PlaylistSidebar;
