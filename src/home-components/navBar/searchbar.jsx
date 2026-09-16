import { useState } from "react";
import { Link } from "react-router-dom";
function SearchBar() {
    return (
        <div>
            <span className="material-symbols-outlined">search</span>           
            <input type="text" className="SearchBar" placeholder="what do you want to play today? " />
        </div>
    )
}    
export default SearchBar