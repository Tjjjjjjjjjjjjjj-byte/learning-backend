import { useState } from "react";
import { useNavigate } from "react-router-dom";
function SearchBar() {
  const [searchValue, setSearchValue] = useState("");
  const navigate = useNavigate();

  function handleSearch(event) {
    event.preventDefault();

    if (searchValue) {
      navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`, { replace: true });
    }
  }

  return (
    <form onSubmit={handleSearch}>
      <span className="material-symbols-outlined">search</span>

      <input
        type="text"
        className="SearchBar"
        placeholder="what do you want to play today?"
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
      />
    </form>
  );
}
export default SearchBar