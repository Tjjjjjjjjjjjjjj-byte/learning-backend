import { useEffect, useRef } from "react";

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  error = "",
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();

    function handleKey(event) {
      if (event.key === "Escape" && !busy) onCancel?.();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [busy, onCancel]);

  return (
    <div
      className="profile-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
      >
        <h3 id="profile-dialog-title">{title}</h3>
        {message && <p className="profile-dialog-message">{message}</p>}

        {children}

        {error && (
          <p className="profile-dialog-error" role="alert">
            {error}
          </p>
        )}

        <div className="profile-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="profile-btn"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>

          <button
            type="button"
            className={danger ? "profile-btn danger solid" : "profile-btn primary"}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy && (
              <span className="material-symbols-outlined profile-spin">
                progress_activity
              </span>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
