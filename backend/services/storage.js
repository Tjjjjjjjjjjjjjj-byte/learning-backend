import fs from "fs";
import path from "path";
import { DOWNLOAD_DIR, PROJECT_ROOT } from "../config.js";
import { db, transaction, importLegacyJsonOnce } from "./db.js";

export function ensureStorageDirectories() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  fs.mkdirSync(path.join(PROJECT_ROOT, "temp", "playback-cache"), { recursive: true });
  importLegacyJsonOnce();
}

/* ---------- users ---------- */

export function findUserByIdentifierOrEmail(value) {
  return db
    .prepare("SELECT identifier, email, password FROM users WHERE identifier = ? OR email = ? LIMIT 1")
    .get(value, value) ?? null;
}

export function findUserByIdentifier(identifier) {
  return db
    .prepare("SELECT identifier, email, password FROM users WHERE identifier = ?")
    .get(identifier) ?? null;
}

export function findUserByEmail(email) {
  return db
    .prepare("SELECT identifier, email, password FROM users WHERE email = ?")
    .get(email) ?? null;
}

export function createUser({ identifier, email, password }) {
  db.prepare("INSERT INTO users (identifier, email, password) VALUES (?, ?, ?)").run(identifier, email, password);
}

export function updateUserPassword(identifier, password) {
  return db.prepare("UPDATE users SET password = ? WHERE identifier = ?").run(password, identifier).changes > 0;
}

/*
 * Deletes the user and everything stored for them in one transaction.
 * Returns the user's download entries so the caller can remove mp3 files
 * that no other account still uses.
 */
export function deleteUserAccount(username) {
  return transaction(() => {
    const mine = db
      .prepare("SELECT track_id AS trackId, name, artist, file, youtube_id AS youtubeId FROM downloads WHERE username = ?")
      .all(username);

    db.prepare("DELETE FROM downloads WHERE username = ?").run(username);
    db.prepare("DELETE FROM playlists WHERE owner = ?").run(username);
    db.prepare("DELETE FROM spotify_saved_playlists WHERE username = ?").run(username);
    db.prepare("DELETE FROM playback_state WHERE username = ?").run(username);
    db.prepare("DELETE FROM recently_played WHERE username = ?").run(username);
    db.prepare("DELETE FROM password_resets WHERE username = ?").run(username);
    db.prepare("DELETE FROM users WHERE identifier = ?").run(username);

    const stillUsed = new Set(db.prepare("SELECT DISTINCT file FROM downloads").all().map((row) => row.file));
    return mine.filter((entry) => entry.file && !stillUsed.has(entry.file));
  });
}

/* ---------- playlists ---------- */

function rowToPlaylist(row, songRows) {
  const songs = [];
  const songAddedAt = {};
  for (const song of songRows) {
    songs.push(song.track_id);
    songAddedAt[song.track_id] = song.added_at ?? row.created_at;
  }

  let downloaded = [];
  try {
    const parsed = JSON.parse(row.downloaded);
    if (Array.isArray(parsed)) downloaded = parsed;
  } catch (error) {
    console.error("PLAYLIST downloaded column is not valid JSON:", error.message);
  }

  const playlist = {
    name: row.name,
    id: row.id,
    cover: row.cover,
    owner: row.owner,
  };
  if (row.status != null) playlist.status = row.status;
  playlist.songs = songs;
  playlist.downloaded = downloaded;
  if (row.description != null) playlist.description = row.description;
  playlist.createdAt = row.created_at;
  playlist.updatedAt = row.updated_at;
  playlist.songAddedAt = songAddedAt;
  return playlist;
}

export function loadPlaylists() {
  const rows = db.prepare("SELECT * FROM playlists ORDER BY id").all();
  const songsByPlaylist = new Map();
  for (const song of db
    .prepare("SELECT playlist_id, track_id, added_at FROM playlist_songs ORDER BY playlist_id, position")
    .all()) {
    if (!songsByPlaylist.has(song.playlist_id)) songsByPlaylist.set(song.playlist_id, []);
    songsByPlaylist.get(song.playlist_id).push(song);
  }
  return rows.map((row) => rowToPlaylist(row, songsByPlaylist.get(row.id) ?? []));
}

/*
 * Syncs the whole playlists array to the database: upserts every playlist,
 * rewrites its songs, and deletes playlists that are no longer in the array.
 * Same contract the JSON version had, so existing routes keep working.
 */
export function savePlaylists(playlists) {
  transaction(() => {
    const now = new Date().toISOString();
    const upsert = db.prepare(
      `INSERT INTO playlists (id, name, cover, owner, status, description, downloaded, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, cover = excluded.cover, owner = excluded.owner,
         status = excluded.status, description = excluded.description,
         downloaded = excluded.downloaded, created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
    );
    const clearSongs = db.prepare("DELETE FROM playlist_songs WHERE playlist_id = ?");
    const insertSong = db.prepare(
      "INSERT INTO playlist_songs (playlist_id, position, track_id, added_at) VALUES (?, ?, ?, ?)",
    );

    const keepIds = [];
    for (const p of playlists) {
      const id = Number(p.id);
      keepIds.push(id);
      const createdAt = p.createdAt || now;
      upsert.run(
        id,
        p.name ?? "My Playlist",
        p.cover ?? null,
        p.owner,
        p.status ?? null,
        p.description ?? null,
        JSON.stringify(Array.isArray(p.downloaded) ? p.downloaded : []),
        createdAt,
        p.updatedAt || createdAt,
      );
      clearSongs.run(id);
      (Array.isArray(p.songs) ? p.songs : []).forEach((trackId, index) => {
        insertSong.run(id, index, String(trackId), p.songAddedAt?.[trackId] ?? createdAt);
      });
    }

    const existing = db.prepare("SELECT id FROM playlists").all().map((row) => row.id);
    const deleteStmt = db.prepare("DELETE FROM playlists WHERE id = ?");
    const keep = new Set(keepIds);
    for (const id of existing) {
      if (!keep.has(id)) deleteStmt.run(id);
    }

    // Keep the id counter ahead of every id ever seen.
    const maxId = keepIds.reduce((max, id) => Math.max(max, id), 0);
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('playlist_id_counter', ?) ON CONFLICT(key) DO UPDATE SET value = MAX(value + 0, excluded.value + 0)",
    ).run(String(maxId));
  });
}

/* Monotonic id: deleting the newest playlist never lets its id be reused. */
export function nextPlaylistId() {
  return transaction(() => {
    const counter = Number(db.prepare("SELECT value FROM meta WHERE key = 'playlist_id_counter'").get()?.value ?? 0);
    const maxExisting = Number(db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM playlists").get().m);
    const next = Math.max(counter, maxExisting) + 1;
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('playlist_id_counter', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(String(next));
    return next;
  });
}

/* ---------- downloads ---------- */

export function readDownloads() {
  const downloads = {};
  for (const row of db
    .prepare("SELECT username, track_id, name, artist, file, youtube_id FROM downloads ORDER BY rowid")
    .all()) {
    if (!downloads[row.username]) downloads[row.username] = [];
    downloads[row.username].push({
      trackId: row.track_id,
      name: row.name,
      artist: row.artist,
      file: row.file,
      youtubeId: row.youtube_id,
    });
  }
  return downloads;
}

/* Syncs the whole { username: [entries] } object, like the JSON version did. */
export function saveDownloads(downloads) {
  transaction(() => {
    db.exec("DELETE FROM downloads");
    const insert = db.prepare(
      "INSERT OR REPLACE INTO downloads (username, track_id, name, artist, file, youtube_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const [username, list] of Object.entries(downloads ?? {})) {
      for (const d of Array.isArray(list) ? list : []) {
        if (!d?.trackId || !d?.file) continue;
        insert.run(username, d.trackId, d.name ?? null, d.artist ?? null, d.file, d.youtubeId ?? null);
      }
    }
  });
}

export function getUserDownloads(username) {
  const downloads = readDownloads();
  const userDownloads = Array.isArray(downloads[username]) ? downloads[username] : [];
  const validDownloads = userDownloads.filter((download) => fs.existsSync(download.file));
  if (validDownloads.length !== userDownloads.length) {
    const removeStmt = db.prepare("DELETE FROM downloads WHERE username = ? AND track_id = ?");
    const valid = new Set(validDownloads.map((d) => d.trackId));
    transaction(() => {
      for (const d of userDownloads) {
        if (!valid.has(d.trackId)) removeStmt.run(username, d.trackId);
      }
    });
  }
  return validDownloads;
}

export function findGlobalDownload(trackId) {
  const rows = db
    .prepare("SELECT track_id, name, artist, file, youtube_id FROM downloads WHERE track_id = ?")
    .all(trackId);
  for (const row of rows) {
    if (fs.existsSync(row.file)) {
      return { trackId: row.track_id, name: row.name, artist: row.artist, file: row.file, youtubeId: row.youtube_id };
    }
  }
  return null;
}

/* ---------- password resets ---------- */

export function readPasswordResets() {
  const resets = {};
  for (const row of db.prepare("SELECT token, username, expires_at FROM password_resets").all()) {
    resets[row.token] = { username: row.username, expiresAt: row.expires_at };
  }
  return resets;
}

/* Syncs the whole { token: { username, expiresAt } } object. */
export function savePasswordResets(resets) {
  transaction(() => {
    db.exec("DELETE FROM password_resets");
    const insert = db.prepare("INSERT INTO password_resets (token, username, expires_at) VALUES (?, ?, ?)");
    for (const [token, entry] of Object.entries(resets ?? {})) {
      if (!entry?.username || !Number.isFinite(entry.expiresAt)) continue;
      insert.run(token, entry.username, entry.expiresAt);
    }
  });
}

export function sanitizeFilename(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/[. ]+$/g, "").trim() || "Unknown";
}

/* ---------- saved public Spotify playlists ---------- */

export function readSpotifyPublicPlaylists() {
  const saved = {};
  for (const row of db
    .prepare("SELECT username, data FROM spotify_saved_playlists ORDER BY username, position")
    .all()) {
    try {
      if (!saved[row.username]) saved[row.username] = [];
      saved[row.username].push(JSON.parse(row.data));
    } catch (error) {
      console.error("SPOTIFY SAVED PLAYLIST row is not valid JSON:", error.message);
    }
  }
  return saved;
}

/* Syncs the whole { username: [references] } object. */
export function saveSpotifyPublicPlaylists(playlists) {
  transaction(() => {
    db.exec("DELETE FROM spotify_saved_playlists");
    const insert = db.prepare(
      "INSERT OR REPLACE INTO spotify_saved_playlists (username, spotify_playlist_id, position, data) VALUES (?, ?, ?, ?)",
    );
    for (const [username, list] of Object.entries(playlists ?? {})) {
      (Array.isArray(list) ? list : []).forEach((item, index) => {
        if (!item?.spotifyPlaylistId) return;
        insert.run(username, item.spotifyPlaylistId, index, JSON.stringify(item));
      });
    }
  });
}

export function loadSpotifyPublicPlaylists() {
  return readSpotifyPublicPlaylists();
}

/* ---------- playback state (one row per user, only that row is written) ---------- */

export function loadPlaybackState(username) {
  const row = db.prepare("SELECT state FROM playback_state WHERE username = ?").get(username);
  if (!row) return null;
  try {
    const state = JSON.parse(row.state);
    return state && typeof state === "object" && !Array.isArray(state) ? state : null;
  } catch (error) {
    console.error("PLAYBACK STATE is not valid JSON for", username, error.message);
    return null;
  }
}

export function savePlaybackState(username, state) {
  db.prepare(
    "INSERT INTO playback_state (username, state) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET state = excluded.state",
  ).run(username, JSON.stringify(state));
}

/* ---------- recently played playlists (for the home dashboard) ---------- */

const MAX_RECENTS_PER_USER = 30;

/*
 * Records that `username` just started playing `playlistId` (the combined
 * id scheme used everywhere else: a number for a local playlist, or
 * "spotify:<id>" for an imported/public one). Re-playing moves it to the
 * front, so "recently played" reflects the last time each one was played.
 */
export function recordRecentPlaylist(username, playlistId) {
  if (!username || playlistId == null) return;

  transaction(() => {
    db.prepare(
      `INSERT INTO recently_played (username, playlist_id, played_at) VALUES (?, ?, ?)
       ON CONFLICT(username, playlist_id) DO UPDATE SET played_at = excluded.played_at`,
    ).run(username, String(playlistId), new Date().toISOString());

    db.prepare(
      `DELETE FROM recently_played
       WHERE username = ? AND rowid NOT IN (
         SELECT rowid FROM recently_played WHERE username = ? ORDER BY played_at DESC LIMIT ?
       )`,
    ).run(username, username, MAX_RECENTS_PER_USER);
  });
}

// Most-recently-played id first.
export function getRecentPlaylistIds(username, limit = 10) {
  return db
    .prepare("SELECT playlist_id FROM recently_played WHERE username = ? ORDER BY played_at DESC LIMIT ?")
    .all(username, limit)
    .map((row) => row.playlist_id);
}
