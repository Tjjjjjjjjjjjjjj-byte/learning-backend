
function Minimize({minimized, setMinimized}) {
    const minimize = () => {
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
export default Minimize