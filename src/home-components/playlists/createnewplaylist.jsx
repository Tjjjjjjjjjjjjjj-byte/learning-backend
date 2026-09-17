function CreateNewPlaylist({ minimized, maximized }) {
  if (minimized) {
    return (
      <button className="createPlaylist-btn">
        <span className="material-symbols-outlined">add</span>
      </button>
    );
  }
  return (
    <div className="playlistCreateDiv">
      <button className="createPlaylist-btn">
        <span className="material-symbols-outlined">add</span>
      </button>
      <p className="createText">Create</p>
    </div>
  );
}
export default CreateNewPlaylist;
