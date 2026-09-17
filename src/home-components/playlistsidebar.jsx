import { useState } from "react";
import CreateNewPlaylist from "./playlists/createnewplaylist";
import Minimize from "./playlists/minimize";
import ExpandLib from "./playlists/expandLibrary";
import Playlist from "./playlists/playlistComponent";
function PlaylistSidebar() {
  const [minimized, setMinimized] = useState(true);
  const [maximized, setMaximized] = useState(false);
  return (
    <>
      <Minimize setMinimized={setMinimized} minimized={minimized} />
      <CreateNewPlaylist minimized={minimized} maximized={maximized} />
      {!minimized && (
        <ExpandLib maximized={maximized} setMaximized={setMaximized} />
      )}
      <Playlist/>
    </>
  );
}
export default PlaylistSidebar;
