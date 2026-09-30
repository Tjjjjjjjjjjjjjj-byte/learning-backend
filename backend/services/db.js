import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, PROJECT_ROOT } from "../config.js";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    cover       TEXT,
    owner       TEXT NOT NULL,
    status      TEXT,
    description TEXT,
    downloaded  TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_playlists_owner ON playlists(owner);

  CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    track_id    TEXT NOT NULL,
    added_at    TEXT,
    PRIMARY KEY (playlist_id, position)
  );

  CREATE TABLE IF NOT EXISTS downloads (
    username   TEXT NOT NULL,
    track_id   TEXT NOT NULL,
    name       TEXT,
    artist     TEXT,
    file       TEXT NOT NULL,
    youtube_id TEXT,
    PRIMARY KEY (username, track_id)
  );

  CREATE TABLE IF NOT EXISTS playback_state (
    username TEXT PRIMARY KEY,
    state    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recently_played (
    username    TEXT NOT NULL,
    playlist_id TEXT NOT NULL,
    played_at   TEXT NOT NULL,
    PRIMARY KEY (username, playlist_id)
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token      TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS spotify_saved_playlists (
    username            TEXT NOT NULL,
    spotify_playlist_id TEXT NOT NULL,
    position            INTEGER NOT NULL,
    data                TEXT NOT NULL,
    PRIMARY KEY (username, spotify_playlist_id)
  );
`);

let transactionDepth = 0;

/** Run fn inside BEGIN/COMMIT; roll back if it throws. Nested calls just run fn. */
export function transaction(fn) {
  if (transactionDepth > 0) return fn();
  db.exec("BEGIN IMMEDIATE");
  transactionDepth = 1;
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw error;
  } finally {
    transactionDepth = 0;
  }
}

/* ---------- one-time import of the old JSON files ---------- */

function readLegacy(name, fallback) {
  const file = path.join(PROJECT_ROOT, name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    console.error(`MIGRATION: could not parse ${name}, skipping it:`, error.message);
    return fallback;
  }
}

export function importLegacyJsonOnce() {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'legacy_json_imported'").get();
  if (done) return;

  const counts = {};

  transaction(() => {
    const users = readLegacy("users.json", []);
    const insertUser = db.prepare(
      "INSERT OR IGNORE INTO users (identifier, email, password) VALUES (?, ?, ?)",
    );
    counts.users = 0;
    for (const u of Array.isArray(users) ? users : []) {
      if (!u?.identifier || !u?.email || typeof u.password !== "string") continue;
      counts.users += insertUser.run(u.identifier, u.email, u.password).changes;
    }

    const playlists = readLegacy("playlists.json", []);
    const fallbackTs = new Date().toISOString();
    const insertPlaylist = db.prepare(
      `INSERT OR IGNORE INTO playlists
         (id, name, cover, owner, status, description, downloaded, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSong = db.prepare(
      "INSERT INTO playlist_songs (playlist_id, position, track_id, added_at) VALUES (?, ?, ?, ?)",
    );
    counts.playlists = 0;
    let maxId = 0;
    for (const p of Array.isArray(playlists) ? playlists : []) {
      const id = Number(p?.id);
      if (!Number.isInteger(id) || !p.owner) continue;
      const createdAt = p.createdAt || fallbackTs;
      const res = insertPlaylist.run(
        id, p.name ?? "My Playlist", p.cover ?? null, p.owner, p.status ?? null,
        p.description ?? null, JSON.stringify(Array.isArray(p.downloaded) ? p.downloaded : []),
        createdAt, p.updatedAt || createdAt,
      );
      if (!res.changes) continue;
      counts.playlists += 1;
      maxId = Math.max(maxId, id);
      (Array.isArray(p.songs) ? p.songs : []).forEach((trackId, index) => {
        insertSong.run(id, index, String(trackId), p.songAddedAt?.[trackId] ?? createdAt);
      });
    }
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('playlist_id_counter', ?) ON CONFLICT(key) DO UPDATE SET value = MAX(value + 0, excluded.value + 0)",
    ).run(String(maxId));

    const downloads = readLegacy("downloads.json", {});
    const insertDownload = db.prepare(
      "INSERT OR REPLACE INTO downloads (username, track_id, name, artist, file, youtube_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    counts.downloads = 0;
    for (const [username, list] of Object.entries(downloads ?? {})) {
      for (const d of Array.isArray(list) ? list : []) {
        if (!d?.trackId || !d?.file) continue;
        insertDownload.run(username, d.trackId, d.name ?? null, d.artist ?? null, d.file, d.youtubeId ?? null);
        counts.downloads += 1;
      }
    }

    const states = readLegacy("playbackState.json", {});
    const insertState = db.prepare("INSERT OR REPLACE INTO playback_state (username, state) VALUES (?, ?)");
    counts.playbackStates = 0;
    for (const [username, state] of Object.entries(states ?? {})) {
      if (!state || typeof state !== "object") continue;
      insertState.run(username, JSON.stringify(state));
      counts.playbackStates += 1;
    }

    const recents = readLegacy("recentlyPlayed.json", {});
    const insertRecent = db.prepare(
      "INSERT OR REPLACE INTO recently_played (username, playlist_id, played_at) VALUES (?, ?, ?)",
    );
    counts.recents = 0;
    for (const [username, list] of Object.entries(recents ?? {})) {
      for (const r of Array.isArray(list) ? list : []) {
        if (r?.id == null) continue;
        insertRecent.run(username, String(r.id), r.playedAt || fallbackTs);
        counts.recents += 1;
      }
    }

    const resets = readLegacy("passwordResets.json", {});
    const insertReset = db.prepare(
      "INSERT OR REPLACE INTO password_resets (token, username, expires_at) VALUES (?, ?, ?)",
    );
    for (const [token, r] of Object.entries(resets ?? {})) {
      if (!r?.username || !Number.isFinite(r.expiresAt)) continue;
      insertReset.run(token, r.username, r.expiresAt);
    }

    const saved = readLegacy("spotifyPublicPlaylists.json", {});
    const insertSaved = db.prepare(
      "INSERT OR REPLACE INTO spotify_saved_playlists (username, spotify_playlist_id, position, data) VALUES (?, ?, ?, ?)",
    );
    counts.savedSpotify = 0;
    for (const [username, list] of Object.entries(saved ?? {})) {
      (Array.isArray(list) ? list : []).forEach((item, index) => {
        if (!item?.spotifyPlaylistId) return;
        insertSaved.run(username, item.spotifyPlaylistId, index, JSON.stringify(item));
        counts.savedSpotify += 1;
      });
    }

    db.prepare("INSERT INTO meta (key, value) VALUES ('legacy_json_imported', ?)").run(new Date().toISOString());
  });

  console.log("Imported legacy JSON data into SQLite:", counts);
}
