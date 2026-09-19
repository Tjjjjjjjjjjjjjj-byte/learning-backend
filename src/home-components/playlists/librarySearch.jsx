import { useState } from "react";
function LibrarySearch({ minimized, maximized, query, setQuery }) {
  const [expandedOpen, setExpandedOpen] = useState(false);

  if (minimized) {
    return null;
  }

  if (!maximized) {
    return (
      <div className={expandedOpen ? "library-search open" : "library-search"}>
        <button
          className="library-search-toggle"
          onClick={() => setExpandedOpen(!expandedOpen)}
          aria-label="Search in Your Library"
        >
          <span className="material-symbols-outlined">search</span>
        </button>
        {expandedOpen && (
          <input
            className="LibrarySearch"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  }

  return (
    <div className="library-search">
      <span className="material-symbols-outlined">search</span>
      <input
        className="LibrarySearch"
        placeholder="Search in Your Library"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );
}

export default LibrarySearch;
