import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearCache, deleteAccount, logout } from "../services/profileApi";
import ConfirmDialog from "./ConfirmDialog";

function SettingRow({ icon, title, description, children }) {
  return (
    <div className="profile-setting-row">
      <span className="material-symbols-outlined profile-setting-icon">{icon}</span>

      <div className="profile-setting-text">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <div className="profile-setting-action">{children}</div>
    </div>
  );
}

function PrivacySettings() {
  const navigate = useNavigate();

  const [cacheState, setCacheState] = useState({ busy: false, message: "", error: "" });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteState, setDeleteState] = useState({ busy: false, error: "" });

  async function handleClearCache() {
    setCacheState({ busy: true, message: "", error: "" });

    try {
      const data = await clearCache();
      const removed = Number(data.removed) || 0;

      setCacheState({
        busy: false,
        message: removed > 0 ? `Cleared ${removed} cached item${removed === 1 ? "" : "s"}.` : "Cache cleared.",
        error: "",
      });
    } catch (error) {
      setCacheState({ busy: false, message: "", error: error.message || "Couldn't clear cache." });
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");

    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error.message || "Log out failed.");
      setLoggingOut(false);
    }
  }

  function closeDelete() {
    if (deleteState.busy) return;
    setDeleteOpen(false);
    setPassword("");
    setDeleteState({ busy: false, error: "" });
  }

  async function handleDelete() {
    setDeleteState({ busy: true, error: "" });

    try {
      await deleteAccount(password);
      navigate("/login", { replace: true });
    } catch (error) {
      setDeleteState({ busy: false, error: error.message || "Couldn't delete account." });
    }
  }

  return (
    <section className="profile-section" aria-labelledby="privacy-heading">
      <div className="profile-section-heading">
        <h2 id="privacy-heading">Privacy</h2>
      </div>

      <div className="profile-settings">
        <SettingRow
          icon="cleaning_services"
          title="Clear cache"
          description="Removes cached playback links and lyrics. Your playlists, downloads and history are kept."
        >
          <button
            type="button"
            className="profile-btn"
            onClick={handleClearCache}
            disabled={cacheState.busy}
          >
            {cacheState.busy && (
              <span className="material-symbols-outlined profile-spin">progress_activity</span>
            )}
            Clear cache
          </button>
        </SettingRow>

        {(cacheState.message || cacheState.error) && (
          <p
            className={cacheState.error ? "profile-note error" : "profile-note success"}
            role="status"
          >
            {cacheState.error || cacheState.message}
          </p>
        )}

        <SettingRow
          icon="logout"
          title="Log out"
          description="Sign out of your account on this device."
        >
          <button
            type="button"
            className="profile-btn"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut && (
              <span className="material-symbols-outlined profile-spin">progress_activity</span>
            )}
            Log out
          </button>
        </SettingRow>

        {logoutError && (
          <p className="profile-note error" role="alert">
            {logoutError}
          </p>
        )}

        <SettingRow
          icon="delete_forever"
          title="Delete account"
          description="Permanently deletes your account, playlists, downloads and listening history. This can't be undone."
        >
          <button
            type="button"
            className="profile-btn danger"
            onClick={() => setDeleteOpen(true)}
          >
            Delete account
          </button>
        </SettingRow>
      </div>

      {deleteOpen && (
        <ConfirmDialog
          title="Delete your account?"
          message="This permanently removes everything tied to your account. Enter your password to confirm."
          confirmLabel="Delete forever"
          danger
          busy={deleteState.busy}
          error={deleteState.error}
          confirmDisabled={!password}
          onConfirm={handleDelete}
          onCancel={closeDelete}
        >
          <input
            className="profile-dialog-input"
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && password && !deleteState.busy) handleDelete();
            }}
          />
        </ConfirmDialog>
      )}
    </section>
  );
}

export default PrivacySettings;
