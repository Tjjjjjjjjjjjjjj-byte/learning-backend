import { useEffect, useState } from "react";
import "../../styling/editdetails.css";

const DEFAULT_COVER = "https://picsum.photos/seed/picsum/200/300";

function EditPlaylistDetails({
  selectedPlaylist,
  setSelectedPlaylist,
  minimized,
  closing,
  onClose,
}) {
  const [hovering, setHovering] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [name, setName] = useState(selectedPlaylist.name || "");
  const [description, setDescription] = useState(
    selectedPlaylist.description || "",
  );
  const [status, setStatus] = useState(selectedPlaylist.status || "private");
  const [cover, setCover] = useState(selectedPlaylist.cover || DEFAULT_COVER);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(selectedPlaylist.name || "");
    setDescription(selectedPlaylist.description || "");
    setStatus(selectedPlaylist.status || "private");
    setCover(selectedPlaylist.cover || DEFAULT_COVER);
    setHidden(true);
  }, [selectedPlaylist]);

  async function updatePlaylist(changes) {
    const response = await fetch(
      `http://localhost:3000/home/playlist/${selectedPlaylist.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(changes),
      },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Failed to update playlist");
    }

    return response.json();
  }

  async function handleSave() {
    setSaving(true);

    try {
      const updatedPlaylist = await updatePlaylist({
        name: name.trim() || "My Playlist",
        description: description.trim(),
        status,
        cover,
      });

      setSelectedPlaylist(updatedPlaylist);
      onClose();
    } catch (error) {
      console.error("Failed to update playlist:", error);
    } finally {
      setSaving(false);
    }
  }

  function handleChangePhoto() {
    const nextCover = window.prompt("Enter an image URL", cover);

    if (!nextCover?.trim()) return;

    setCover(nextCover.trim());
    setHidden(true);
  }

  function handleRemovePhoto() {
    setCover(DEFAULT_COVER);
    setHidden(true);
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className={`edit-details-overlay ${
        minimized ? "sidebar-minimized" : "sidebar-expanded"
      } ${closing ? "closing" : ""}`}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="edit-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="edit-close"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <span className="header" id="edit-details-title">
          Edit details
        </span>

        <div className="edit-main">
          <div
            className="edit-photo"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => {
              setHovering(false);
              setHidden(true);
            }}
          >
            <img src={cover} alt="Playlist cover" />

            {hovering && (
              <div className="edit-dots">
                <button
                  className="dots"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setHidden(!hidden);
                  }}
                >
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>

                {!hidden && (
                  <div className="dot-edit-values">
                    <button type="button" onClick={handleChangePhoto}>
                      Change photo
                    </button>
                    <button type="button" onClick={handleRemovePhoto}>
                      Remove photo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="edit-fields">
            <div className="edit-field">
              <span className="edit-field-label">Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="edit-name"
                placeholder="Enter a name"
                maxLength={100}
              />
            </div>

            <div className="edit-field">
              <span className="edit-field-label">Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="edit-description"
                placeholder="Add a description"
                maxLength={300}
                rows={4}
              />
            </div>
          </div>
        </div>

        <div className="edit-actions">
          <button
            className="edit-private"
            type="button"
            onClick={() =>
              setStatus(status === "private" ? "public" : "private")
            }
          >
            <span className="material-symbols-outlined">
              {status === "private" ? "lock" : "lock_open"}
            </span>
            {status === "private" ? "Make public" : "Make private"}
          </button>

          <button
            className="edit-save"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditPlaylistDetails;
