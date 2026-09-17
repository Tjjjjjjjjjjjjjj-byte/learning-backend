
function Minimize({minimized, setMinimized}) {
    const minimize = () => {
        if(minimized === true) {
            setMinimized(false)
        } else {
            setMinimized(true)
        }
    }
    
    return (
        minimized ? (
            <button className="expandBtn" onClick={minimize}><span className="material-symbols-outlined">menu</span></button>
        ) : (
            <div className="expand-btn-div">
                <button className="expandBtn" onClick={minimize}><span className="material-symbols-outlined">menu</span></button>
                <p className="expandP">Your Library</p>
            </div>
        )
    )
}
export default Minimize