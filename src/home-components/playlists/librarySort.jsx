import { useState, useRef, useEffect } from "react";

const SORT_OPTIONS = ["Recents", "Recently Added", "Alphabetical", "Creator"];

/**
 * "Sort by" / "View as" control for "Your Library".
 * - minimized (72px rail): no room — renders nothing.
 * - expanded (320px rail): icon-only trigger, same dropdown.
 * - maximized: full "<current sort> ▾" trigger, as in the reference.
 *
 * viewMode/setViewMode is lifted up to PlaylistSidebar so the
 * playlist list itself can react to it.
 */
function LibrarySort({ minimized, maximized, viewMode, setViewMode }) {
  const [open, setOpen] = useState(false);
  const [sortBy, setSortBy] = useState("Recents");
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
        {maximized && <span>{sortBy}</span>}
        <span className="material-symbols-outlined">list</span>
      </button>

      {open && (
        <div className="sort-dropdown">
          <p className="sort-dropdown-label">Sort by</p>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option}
              className={
                sortBy === option ? "sort-option selected" : "sort-option"
              }
              onClick={() => {
                setSortBy(option);
              }}
            >
              <span>{option}</span>
              {sortBy === option && (
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
