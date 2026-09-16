import { useState } from "react";
import { Link } from "react-router-dom";
function SearchBar() {
    const [searchBarActive, setSearchBarActive] = useState(false)
    const toggleSearchBar = () => {
        if(searchBarActive === true) {
            setSearchBarActive(false)
        } else {
            setSearchBarActive(true)
        }
    }
    return (
        <>
            <button className="searchBarBtn" onClick={toggleSearchBar}><span className="material-symbols-outlined">search</span></button>
            <input type="text" className={searchBarActive ? "search-bar" : "search-bar hidden"} />
        </>
    )
}
export default SearchBar