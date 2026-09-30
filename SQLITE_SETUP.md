# SQLite backend: setup and usage

All app data now lives in one SQLite file instead of seven JSON files.
Routes and the frontend are unchanged; only `backend/services/storage.js` (plus the
new `backend/services/db.js`) know about the database.

## Requirements

- **Node 22.13 or newer.** The database uses Node's built-in `node:sqlite` module, so there is
  **no new npm dependency** and nothing to compile. Check with `node -v`.
- yt-dlp and ffmpeg, as before.

## Setup

1. Put the changed files into your project (see "Files changed" below).
2. Make sure `.env` still has your Spotify keys. Optional: `DB_PATH=data/app.db` to move the database.
3. Run the API as usual:

   ```
   npm start
   ```

4. On the first start you will see a line like
   `Imported legacy JSON data into SQLite: { users: 6, playlists: 2, ... }`.
   That is the one-time import of `users.json`, `playlists.json`, `downloads.json`,
   `playbackState.json`, `recentlyPlayed.json`, `passwordResets.json` and
   `spotifyPublicPlaylists.json`. You do not need to re-register.
5. Start the UI with `npm run dev`.

The database is created at `data/app.db` (plus `app.db-wal` and `app.db-shm` while running, which is normal).

## About the old JSON files

They are **not modified or deleted**; after the import the server ignores them. Once you have
logged in and checked your playlists, move them somewhere safe (or delete them). To redo the import,
stop the server, delete `data/app.db*`, and start again.

## Looking at the data

Any SQLite viewer works (DB Browser for SQLite, the VS Code "SQLite Viewer" extension), or the CLI:

```
sqlite3 data/app.db ".tables"
sqlite3 data/app.db "SELECT id, name, owner FROM playlists;"
```

## Backups

Stop the server and copy `data/app.db`, or with the sqlite3 CLI while it runs:

```
sqlite3 data/app.db ".backup data/backup.db"
```

## Tables

| Table | What it holds |
|---|---|
| `users` | `identifier` (username), `email`, `password`. Both unique. |
| `playlists` | one row per local playlist (name, cover, owner, status, description, timestamps) |
| `playlist_songs` | songs in each playlist, in order, with the time each was added |
| `downloads` | downloaded mp3s per user (`file` is the path on disk) |
| `playback_state` | one JSON blob per user (current track, queue, history) |
| `recently_played` | last 30 playlists each user played |
| `password_resets` | pending reset tokens |
| `spotify_saved_playlists` | Spotify playlists a user saved |
| `meta` | import flag and the playlist id counter |

## Behaviour changes worth knowing

- **Playlist ids never get reused.** New ids come from a counter (`nextPlaylistId()`), so deleting the newest playlist can't recycle its id.
- **Account deletion is atomic.** All of a user's rows are removed in one transaction.
- **Sign-up can't create duplicates**, even with two simultaneous requests (UNIQUE constraints).
- **Playback saves write only that user's row** instead of rewriting everyone's data.
- **Passwords are still plaintext**, exactly as before. Hashing is Phase 2 item 1; with a database it is now just a change in `auth.js`/`account.js` plus a one-time update of the `password` column.

## Downloads go to the browser (like Chrome downloads)

After a song finishes downloading on the server (still used for in-app offline playback), the browser
also saves it as a normal file download:

- **1 to 5 songs:** each arrives as its own `.mp3` named `Artist - Title.mp3`.
- **6 or more songs at once** (select several, or "Download playlist"): one `songs-YYYY-MM-DD.zip`.

Chrome may ask once whether to allow multiple downloads when several mp3s arrive together; click Allow.
Routes: `GET /song/save/:trackId`, `POST /song/save-zip` (returns a one-time token), `GET /song/save-zip/:token`.
The zip writer is `backend/services/zip.js` (no dependency).
Only songs downloaded in that action are handed to the browser; songs that were already downloaded are skipped.

## Files changed

- new: `backend/services/db.js`, `backend/services/zip.js`, `src/services/browserDownload.js`, `SQLITE_SETUP.md`
- rewritten: `backend/services/storage.js`
- edited: `backend/config.js`, `backend/server.js`, `backend/routes/auth.js`, `backend/routes/account.js`, `backend/routes/playlists.js`, `backend/routes/songs.js`, `src/home-components/playlistTrueComponent.jsx`, `src/home-components/playlistDetatlComponents/features.jsx`, `src/home-components/playlistDetatlComponents/song.jsx`, `src/searchpagecomponents/Trackcard.jsx`, `package.json`, `.gitignore`

## Limits

- Playlists, downloads, reset tokens and saved Spotify playlists are still loaded and saved as whole sets
  (like the JSON version) inside a transaction. Fine for a personal app; per-row queries would be the next step if it grows.
- SQLite allows one writer at a time. That is fine for a single Express process; don't run several server copies against one file.
