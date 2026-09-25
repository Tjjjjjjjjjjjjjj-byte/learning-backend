import { useState, useRef, useEffect } from "react";

const SORT_OPTIONS = ["Recents", "Recently Added", "Alphabetical", "Creator"];

function LibrarySort({ minimized, maximized, viewMode, setViewMode, setSort, sort }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (minimized) {
    return null;
  }

  return (
    <div className="library-sort" ref={containerRef}>
      <button className="sort-btn" onClick={() => setOpen(!open)}>
        {maximized && <span>{sort}</span>}
        <span className="material-symbols-outlined">list</span>
      </button>

      {open && (
        <div className="sort-dropdown">
          <p className="sort-dropdown-label">Sort by</p>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option}
              className={
                sort === option ? "sort-option selected" : "sort-option"
              }
              onClick={() => {
                setSort(option);
              }}
            >
              <span>{option}</span>
              {sort === option && (
                <span className="material-symbols-outlined">check</span>
              )}
            </button>
          ))}

          <p className="sort-dropdown-label view-as-label">View as</p>
          <div className="view-toggle">
            <button
              className={
                viewMode === "list" ? "view-btn active" : "view-btn"
              }
              onClick={() => setViewMode("list")}
              aria-label="List view"
            >
              <span className="material-symbols-outlined">list</span>
            </button>
            <button
              className={
                viewMode === "grid" ? "view-btn active" : "view-btn"
              }
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
            >
              <span className="material-symbols-outlined">grid_view</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LibrarySort;
