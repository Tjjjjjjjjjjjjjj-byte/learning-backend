
function ExpandLibrary({minimized, setMinimized}) {
    function minimize() {
        if(minimized === true) {
            setMinimized(false)
        } else {
            setMinimized(true)
        }
    }
    return (
        <button className="expandBtn" onClick={minimize}><span className="material-symbols-outlined">menu</span></button>
    )
}
export default ExpandLibrary