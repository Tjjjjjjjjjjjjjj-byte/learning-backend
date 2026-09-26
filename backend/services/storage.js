import fs from "fs";
import path from "path";
import {
  DOWNLOADS_FILE,
  DOWNLOAD_DIR,
  PASSWORD_RESETS_FILE,
  PROJECT_ROOT,
} from "../config.js";

export function ensureStorageDirectories() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  fs.mkdirSync(path.join(PROJECT_ROOT, "temp", "playback-cache"), { recursive: true });
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
