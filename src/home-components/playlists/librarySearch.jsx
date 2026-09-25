import { useState, useEffect, useRef } from "react";

function LibrarySearch({ minimized, maximized, query, setQuery }) {
  const [expandedOpen, setExpandedOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      // FIX: Using 'click' ensures the DOM state has synchronized correctly
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setExpandedOpen(false);
      }
    }

    // FIX: Listen to 'click' instead of 'mousedown'
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  if (minimized) {
    return null;
  }

  if (!maximized) {
    return (
      <div 
        className={expandedOpen ? "library-search open" : "library-search"}
        ref={containerRef}
      >
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
    <div className="library-search" ref={containerRef}>
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
