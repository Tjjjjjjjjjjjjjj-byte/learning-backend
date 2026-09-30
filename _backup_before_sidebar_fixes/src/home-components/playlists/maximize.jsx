function Maximize({ maximized, setMaximized, minimized, setSelectedPlaylist }) {
  if (minimized) return null;

  return (
    <button
      className={maximized ? "maximize-btn" : "maximize-btn hidden"}
      onClick={() => {
        setMaximized(!maximized);
        setSelectedPlaylist?.(null);
      }}
    >
      <span className="material-symbols-outlined">expand_content</span>
    </button>
  );
}

export default Maximize;
