import fs from "fs";
import path from "path";
import {
  DOWNLOADS_FILE,
  DOWNLOAD_DIR,
  PASSWORD_RESETS_FILE,
  PROJECT_ROOT,
  PLAYBACK_STATE_FILE,
} from "../config.js";

export function ensureStorageDirectories() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  fs.mkdirSync(path.join(PROJECT_ROOT, "temp", "playback-cache"), { recursive: true });

  if (!fs.existsSync(PLAYBACK_STATE_FILE)) {
    fs.writeFileSync(PLAYBACK_STATE_FILE, "{}", "utf-8");
  }
}

export function ensurePlaylistMetadata(playlists) {
  let changed = false;
  let fallbackTimestamp = null;

  try {
    fallbackTimestamp = fs.statSync(path.join(PROJECT_ROOT, "playlists.json")).mtime.toISOString();
  } catch {
    fallbackTimestamp = new Date(0).toISOString();
  }

  for (const playlist of playlists) {
    if (!playlist.createdAt) {
      playlist.createdAt = fallbackTimestamp;
      changed = true;
    }
    if (!playlist.updatedAt) {
      playlist.updatedAt = playlist.createdAt;
      changed = true;
    }
    if (!playlist.songAddedAt || typeof playlist.songAddedAt !== "object" || Array.isArray(playlist.songAddedAt)) {
      playlist.songAddedAt = {};
      changed = true;
    }
    for (const trackId of Array.isArray(playlist.songs) ? playlist.songs : []) {
      if (!playlist.songAddedAt[trackId]) {
        playlist.songAddedAt[trackId] = playlist.createdAt;
        changed = true;
      }
    }
  }

  return changed;
}

export function savePlaylists(playlists) {
  fs.writeFileSync(path.join(PROJECT_ROOT, "playlists.json"), JSON.stringify(playlists, null, 2), "utf-8");
}

export function loadPlaylists() {
  const playlists = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "playlists.json"), "utf-8"));
  if (ensurePlaylistMetadata(playlists)) savePlaylists(playlists);
  return playlists;
}

export function readDownloads() {
  if (!fs.existsSync(DOWNLOADS_FILE)) return {};
  return JSON.parse(fs.readFileSync(DOWNLOADS_FILE, "utf-8"));
}

export function saveDownloads(downloads) {
  fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify(downloads, null, 2), "utf-8");
}

export function getUserDownloads(username) {
  const downloads = readDownloads();
  const userDownloads = Array.isArray(downloads[username]) ? downloads[username] : [];
  const validDownloads = userDownloads.filter((download) => fs.existsSync(download.file));
  if (validDownloads.length !== userDownloads.length) {
    downloads[username] = validDownloads;
    saveDownloads(downloads);
  }
  return validDownloads;
}

export function readPasswordResets() {
  if (!fs.existsSync(PASSWORD_RESETS_FILE)) return {};
  return JSON.parse(fs.readFileSync(PASSWORD_RESETS_FILE, "utf-8"));
}

export function savePasswordResets(resets) {
  fs.writeFileSync(PASSWORD_RESETS_FILE, JSON.stringify(resets, null, 2), "utf-8");
}

export function sanitizeFilename(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/[. ]+$/g, "").trim() || "Unknown";
}

export function findGlobalDownload(trackId) {
  const downloads = readDownloads();
  for (const userDownloads of Object.values(downloads)) {
    if (!Array.isArray(userDownloads)) continue;
    const found = userDownloads.find((download) => download.trackId === trackId && fs.existsSync(download.file));
    if (found) return found;
  }
  return null;
}


export function readSpotifyPublicPlaylists() {
  const file = path.join(PROJECT_ROOT, "spotifyPublicPlaylists.json");
  if (!fs.existsSync(file)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function saveSpotifyPublicPlaylists(playlists) {
  const file = path.join(PROJECT_ROOT, "spotifyPublicPlaylists.json");
  fs.writeFileSync(file, JSON.stringify(playlists, null, 2), "utf-8");
}

export function loadSpotifyPublicPlaylists() {
  return readSpotifyPublicPlaylists();
}


export function readPlaybackStates() {
  if (!fs.existsSync(PLAYBACK_STATE_FILE)) return {};

  try {
    const data = JSON.parse(fs.readFileSync(PLAYBACK_STATE_FILE, "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data)
      ? data
      : {};
  } catch {
    return {};
  }
}

export function loadPlaybackState(username) {
  const states = readPlaybackStates();
  const state = states[username];

  if (!state || typeof state !== "object") {
    return null;
  }

  return state;
}

export function savePlaybackState(username, state) {
  const states = readPlaybackStates();
  states[username] = state;
  fs.writeFileSync(PLAYBACK_STATE_FILE, JSON.stringify(states, null, 2), "utf-8");
}

/* ---------- recently played playlists (for the home dashboard) ---------- */

const RECENTLY_PLAYED_FILE = path.join(PROJECT_ROOT, "recentlyPlayed.json");
const MAX_RECENTS_PER_USER = 30;

function readRecentlyPlayed() {
  if (!fs.existsSync(RECENTLY_PLAYED_FILE)) return {};

  try {
    const data = JSON.parse(fs.readFileSync(RECENTLY_PLAYED_FILE, "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeRecentlyPlayed(data) {
  fs.writeFileSync(RECENTLY_PLAYED_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/*
 * Records that `username` just started playing `playlistId` (the combined
 * id scheme used everywhere else: a number for a local playlist, or
 * "spotify:<id>" for an imported/public one). Moves it to the front if it
 * was already there, so "recently played" reflects the last time each
 * playlist was played, not every play.
 */
export function recordRecentPlaylist(username, playlistId) {
  if (!username || playlistId == null) return;

  const key = String(playlistId);
  const data = readRecentlyPlayed();
  const existing = Array.isArray(data[username]) ? data[username] : [];

  const next = [
    { id: key, playedAt: new Date().toISOString() },
    ...existing.filter((entry) => entry?.id !== key),
  ].slice(0, MAX_RECENTS_PER_USER);

  data[username] = next;
  writeRecentlyPlayed(data);
}

// Most-recently-played id first.
export function getRecentPlaylistIds(username, limit = 10) {
  const data = readRecentlyPlayed();
  const entries = Array.isArray(data[username]) ? data[username] : [];
  return entries.slice(0, limit).map((entry) => entry.id);
}
