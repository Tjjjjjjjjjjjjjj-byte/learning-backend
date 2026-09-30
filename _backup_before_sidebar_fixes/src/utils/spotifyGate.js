import { useSyncExternalStore } from "react";

/*
 * "Can I start this track right now?" gate.
 *
 * Before a play click starts a track, ask the backend whether Spotify is
 * currently rate limiting us (GET /spotify/status -- no Spotify call, it just
 * reads the cooldown state). If it is, and the track isn't already cached,
 * keep the play button in the same spinning loading state used elsewhere and
 * poll until the cooldown clears, then start playback automatically.
 *
 * Only the most recent click counts: clicking another track cancels the
 * previous wait, so a stale click can't start playing later.
 */

const STATUS_URL = "http://localhost:3000/spotify/status";
const MAX_WAIT_MS = 3 * 60 * 1000;

let state = { pendingTrackId: null, retryAfterSeconds: 0 };
const listeners = new Set();
let activeToken = 0;

function setState(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

/* Which track (if any) is currently waiting on Spotify, and for how long. */
export function useSpotifyGate() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

async function fetchStatus(trackId) {
  const response = await fetch(
    `${STATUS_URL}?trackId=${encodeURIComponent(trackId)}`,
    { credentials: "include" },
  );

  if (!response.ok) throw new Error(`status HTTP ${response.status}`);

  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
 * Resolves true when it's OK to start the track, false if this wait was
 * superseded by a newer click (caller should then do nothing).
 * Fails open: if the status check itself errors, playback just proceeds.
 */
export async function waitForSpotifyReady(trackId) {
  activeToken += 1;
  const token = activeToken;
  const startedAt = Date.now();

  try {
    while (true) {
      let status;

      try {
        status = await fetchStatus(trackId);
      } catch {
        return token === activeToken; // can't tell -> don't block playback
      }

      if (token !== activeToken) return false;

      if (status.ready) return true;

      if (Date.now() - startedAt > MAX_WAIT_MS) return true; // stop waiting, try anyway

      const seconds = Math.max(1, Number(status.retryAfterSeconds) || 3);

      setState({ pendingTrackId: trackId, retryAfterSeconds: seconds });

      // Re-check a little after the cooldown ends (+jitter), at most every 15s
      await sleep(Math.min(seconds * 1000 + Math.random() * 500, 15000));

      if (token !== activeToken) return false;
    }
  } finally {
    if (token === activeToken) {
      setState({ pendingTrackId: null, retryAfterSeconds: 0 });
    }
  }
}

/* Cancel any wait (e.g. the user paused or navigated away). */
export function cancelSpotifyWait() {
  activeToken += 1;
  setState({ pendingTrackId: null, retryAfterSeconds: 0 });
}
