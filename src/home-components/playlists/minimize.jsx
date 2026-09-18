
function Minimize({minimized, setMinimized, maximized}) {
    return (
        minimized ? (
            <button className="expandBtn" onClick={() => setMinimized(!minimized)}><span className="material-symbols-outlined">menu</span></button>
        ) : (
            <div className="expand-btn-div">
                {!maximized ? <button className="expandBtn" onClick={() => setMinimized(!minimized)}><span className="material-symbols-outlined">menu</span><p className="expandP">Your Library</p></button> : <p className="expandP">Your Library</p>}
                
            </div>
        )
    )
}
export default Minimize