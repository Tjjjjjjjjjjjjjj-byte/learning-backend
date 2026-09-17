import { useState } from "react"
function Maximize({maximized, setMaximized, minimized}) {
    const handleMinimize = () => {
        setMaximized(!maximized)
    }
    return (
            !minimized && (
                <button className={maximized ? "maximize-btn" : "maximize-btn hidden"} onClick={handleMinimize}><span className="material-symbols-outlined">expand_content</span></button>
            )
    )
}
export default Maximize