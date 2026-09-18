function CreateNewPlaylist({ minimized, maximized }) {
  return (
    <>
      {!minimized ? (
        <div className="playlistCreateDiv">
          <button className="createPlaylist-btn">
            <span className="material-symbols-outlined">add</span>
            <p className="createText">Create</p>
          </button>
        </div>
      ) : (
        <div className="minimized">
          <button className="createPlaylist-btn">
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      )}
      <div className="create-options">
        <button className="playlist"><span className="create-option-title">Playlist</span><p className="explanation">Create a playlist with songs or episodes</p></button>
      </div>
    </>
  );
}
export default CreateNewPlaylist;
