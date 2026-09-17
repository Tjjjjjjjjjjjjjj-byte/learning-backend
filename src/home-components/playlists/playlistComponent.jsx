import { useState } from "react"

function Playlist() {
    const [hovering, setHovering] = useState(false)
    return (
        <button className="playlist" onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}>
            <img src="" alt="" />
            {hovering && <span className="material-symbols-outlined">play_circle</span>}
        </button>    
    )
}
export default Playlist