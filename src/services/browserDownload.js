const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

// More than this many songs at once are delivered as a single zip.
export const ZIP_THRESHOLD = 5;

function triggerBrowserDownload(url) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * Hands already-downloaded songs to the browser as normal file downloads
 * (they show up in Chrome's download bar / Downloads folder).
 * 1-5 songs: one mp3 each. 6 or more: one zip.
 * Throws on failure so the caller can decide how to report it.
 */
export async function saveTracksToDevice(trackIds) {
  const ids = [...new Set(trackIds.filter(Boolean))];
  if (ids.length === 0) return;

  if (ids.length > ZIP_THRESHOLD) {
    const response = await fetch(`${API_BASE}/song/save-zip`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: ids }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not prepare the zip");
    triggerBrowserDownload(`${API_BASE}/song/save-zip/${data.token}`);
    return;
  }

  for (const id of ids) {
    triggerBrowserDownload(`${API_BASE}/song/save/${encodeURIComponent(id)}`);
    await wait(500); // Chrome drops downloads fired in the same instant
  }
}
