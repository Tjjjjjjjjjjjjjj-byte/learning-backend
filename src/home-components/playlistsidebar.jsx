import { useState } from "react"
import CreateNewPlaylist from "./playlists/createnewplaylist"
import ExpandLibrary from "./playlists/expandlibrarybtn"
function PlaylistSidebar() {
    const [minimized, setMinimized] = useState(true)
    return (
        <>
            <ExpandLibrary setMinimized={setMinimized} minimized={minimized}/>
            <CreateNewPlaylist/>
        </>
    )
}
export default PlaylistSidebar