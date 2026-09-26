import express from "express";
import fs from "fs";
import cors from "cors";
import validator from "validator";
import crypto from "crypto";
import path from "path";
import session from "express-session";

import {
  PORT,
  PROJECT_ROOT,
  DOWNLOADS_FILE,
  DOWNLOAD_DIR,
  PASSWORD_RESETS_FILE,
  PLAYBACK_CACHE_DIR,
  PLAYBACK_PRELOAD_CONCURRENCY,
  LYRIC_CACHE_TTL_MS,
  PLAYBACK_STATE_FILE,
  MAX_PLAYBACK_HISTORY,
} from "./config.js";
import { ensureStorageDirectories, loadPlaylists, savePlaylists, readDownloads, saveDownloads, getUserDownloads, readPasswordResets, savePasswordResets, sanitizeFilename, findGlobalDownload, loadSpotifyPublicPlaylists, saveSpotifyPublicPlaylists, loadPlaybackState, savePlaybackState } from "./services/storage.js";
import { getSpotifyToken, getSpotifyTrackForLyrics } from "./services/spotify.js";
import { extractSpotifyPlaylistId, getSpotifyPublicPlaylist } from "./services/spotifyPlaylist.js";
import { findYoutubeVideo } from "./services/youtube.js";
import { cleanupPlaybackCache, readPlaybackCache, getOrCreatePlaybackUrl, runWithConcurrency } from "./services/playback.js";
import { parseLrcLyrics, createLyricsCache } from "./services/lyrics.js";

import { registerRoutes as registerAuthRoutes } from "./routes/auth.js";
import { registerRoutes as registerPlaylistRoutes } from "./routes/playlists.js";
import { registerRoutes as registerSearchRoutes } from "./routes/search.js";
import { registerRoutes as registerSongRoutes } from "./routes/songs.js";
import { registerRoutes as registerLyricsRoutes } from "./routes/lyrics.js";
import { registerRoutes as registerLegacyStreamRoutes } from "./routes/stream.js";
import { registerRoutes as registerPlaybackRoutes } from "./routes/playback.js";
import { registerRoutes as registerSpotifyPlaylistRoutes } from "./routes/spotifyPlaylists.js";
import { registerRoutes as registerImageProxyRoutes } from "./routes/imageProxy.js";

const app = express();
const lyricsCache = createLyricsCache();

ensureStorageDirectories();
cleanupPlaybackCache();

app.use(
  session({
    secret: "some-random-secret-string",
    resave: false,
    saveUninitialized: false,
  }),
);

app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

const context = {
  fs,
  path,
  validator,
  crypto,
  PROJECT_ROOT,
  PORT,
  DOWNLOADS_FILE,
  DOWNLOAD_DIR,
  PASSWORD_RESETS_FILE,
  PLAYBACK_CACHE_DIR,
  PLAYBACK_PRELOAD_CONCURRENCY,
  LYRIC_CACHE_TTL_MS,
  PLAYBACK_STATE_FILE,
  MAX_PLAYBACK_HISTORY,
  getSpotifyToken,
  getSpotifyTrackForLyrics,
  getSpotifyPublicPlaylist,
  extractSpotifyPlaylistId,
  findYoutubeVideo,
  getUserDownloads,
  findGlobalDownload,
  readDownloads,
  loadSpotifyPublicPlaylists,
  saveSpotifyPublicPlaylists,
  loadPlaybackState,
  savePlaybackState,
  saveDownloads,
  sanitizeFilename,
  loadPlaylists,
  savePlaylists,
  readPasswordResets,
  savePasswordResets,
  readPlaybackCache,
  getOrCreatePlaybackUrl,
  runWithConcurrency,
  parseLrcLyrics,
};

registerAuthRoutes(app, context);
registerPlaybackRoutes(app, context);
registerPlaylistRoutes(app, context);
registerSearchRoutes(app, context);
registerSpotifyPlaylistRoutes(app, context);
registerImageProxyRoutes(app, context);
registerSongRoutes(app, context);
registerLyricsRoutes(app, context);
registerLegacyStreamRoutes(app, context);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
