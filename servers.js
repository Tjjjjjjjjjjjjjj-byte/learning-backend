import express from "express";
import fs from "fs";
import cors from "cors";
import validator from "validator";
import { spawn } from "child_process";
import path from "path";
import crypto from "crypto";

const app = express();
const PORT = 3000;
const DOWNLOADS_FILE = "./downloads.json";
const DOWNLOAD_DIR = "./downloads";
const PASSWORD_RESETS_FILE = "./passwordResets.json";
const PLAYBACK_CACHE_DIR = "./temp/playback-cache";
const PLAYBACK_CACHE_TTL_MS = 30 * 60 * 1000;
const PLAYBACK_PRELOAD_CONCURRENCY = 3;
const LYRICSTIFY_API_URL = "http://localhost:3001/v1/lyrics";
const LYRIC_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
fs.mkdirSync(PLAYBACK_CACHE_DIR, { recursive: true });

const playbackExtractionPromises = new Map();
const lyricsCache = new Map();

function getPlaybackCacheFile(trackId) {
  const safeId = crypto
    .createHash("sha256")
    .update(String(trackId))
    .digest("hex");

  return path.join(PLAYBACK_CACHE_DIR, `${safeId}.json`);
}

function readPlaybackCache(trackId) {
  const cacheFile = getPlaybackCacheFile(trackId);

  if (!fs.existsSync(cacheFile)) {
    return null;
  }

  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));

    if (
      !cached ||
      cached.trackId !== trackId ||
      typeof cached.url !== "string" ||
      !cached.expiresAt ||
      Date.parse(cached.expiresAt) <= Date.now()
    ) {
      fs.unlinkSync(cacheFile);
      return null;
    }

    return cached;
  } catch {
    try {
      fs.unlinkSync(cacheFile);
    } catch {
      return null;
    }

    return null;
  }
}

function savePlaybackCache(trackId, url) {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PLAYBACK_CACHE_TTL_MS);

  const cacheFile = getPlaybackCacheFile(trackId);

  fs.writeFileSync(
    cacheFile,
    JSON.stringify(
      {
        trackId,
        url,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function invalidatePlaybackCache(trackId) {
  const cacheFile = getPlaybackCacheFile(trackId);

  if (fs.existsSync(cacheFile)) {
    try {
      fs.unlinkSync(cacheFile);
    } catch {
      return;
    }
  }
}

function cleanupPlaybackCache() {
  if (!fs.existsSync(PLAYBACK_CACHE_DIR)) {
    return;
  }

  for (const filename of fs.readdirSync(PLAYBACK_CACHE_DIR)) {
    if (!filename.endsWith(".json")) {
      continue;
    }

    const cacheFile = path.join(PLAYBACK_CACHE_DIR, filename);

    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));

      if (!cached?.expiresAt || Date.parse(cached.expiresAt) <= Date.now()) {
        fs.unlinkSync(cacheFile);
      }
    } catch {
      try {
        fs.unlinkSync(cacheFile);
      } catch {
        continue;
      }
    }
  }
}

cleanupPlaybackCache();

function runYtDlp(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const process = spawn("yt-dlp", args);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;

      settled = true;

      if (!process.killed) {
        process.kill("SIGKILL");
      }

      reject(new Error("yt-dlp process timed out"));
    }, timeoutMs);

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("error", (error) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    process.on("close", (code) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

async function findYoutubeVideo(name, artist) {
  const trackQuery = `${name} ${artist}`;

  const result = await runYtDlp([
    "--skip-download",
    "--flat-playlist",
    "--dump-single-json",
    `ytsearch5:${trackQuery}`,
  ]);

  let searchData;

  try {
    searchData = JSON.parse(result.stdout);
  } catch {
    throw new Error("YouTube search returned invalid data");
  }

  const results = (searchData.entries || [])
    .map((entry) => {
      const rawId = entry.id || entry.url;

      const id =
        typeof rawId === "string"
          ? rawId.replace(/^https?:\/\/(www\.)?youtube\.com\/watch\?v=/, "")
          : "";

      return {
        id,
        title: entry.title || "",
        uploader: entry.uploader || entry.channel || "",
        url:
          entry.webpage_url ||
          (typeof rawId === "string" && rawId.startsWith("http")
            ? rawId
            : id
              ? `https://www.youtube.com/watch?v=${id}`
              : ""),
      };
    })
    .filter((video) => video.id && video.url);

  if (!results.length) {
    throw new Error("Song not found on YouTube");
  }

  const normalizedArtist = String(artist).toLowerCase();

  return (
    results.find((video) =>
      video.uploader?.toLowerCase().includes(normalizedArtist),
    ) || results[0]
  );
}

async function extractPlayableAudioUrl(name, artist) {
  const video = await findYoutubeVideo(name, artist);

  const result = await runYtDlp([
    "--no-playlist",
    "--format",
    "bestaudio/best",
    "--get-url",
    video.url,
  ]);

  const audioUrl = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("http://") || line.startsWith("https://"));

  if (!audioUrl) {
    throw new Error("yt-dlp returned no playable audio URL");
  }

  try {
    const parsedUrl = new URL(audioUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Unsupported audio URL protocol");
    }
  } catch {
    throw new Error("yt-dlp returned an invalid audio URL");
  }

  return audioUrl;
}

async function getOrCreatePlaybackUrl(
  trackId,
  name,
  artist,
  forceRefresh = false,
) {
  if (!forceRefresh) {
    const cached = readPlaybackCache(trackId);

    if (cached) {
      return {
        url: cached.url,
        cached: true,
      };
    }
  }

  if (forceRefresh) {
    invalidatePlaybackCache(trackId);
  }

  const existingPromise = playbackExtractionPromises.get(trackId);

  if (existingPromise) {
    return {
      url: await existingPromise,
      cached: false,
    };
  }

  const extractionPromise = extractPlayableAudioUrl(name, artist)
    .then((url) => {
      savePlaybackCache(trackId, url);
      return url;
    })
    .finally(() => {
      playbackExtractionPromises.delete(trackId);
    });

  playbackExtractionPromises.set(trackId, extractionPromise);

  return {
    url: await extractionPromise,
    cached: false,
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          ok: false,
          error: error.message,
        };
      }
    }
  }

  const workers = Array.from(
    {
      length: Math.min(concurrency, items.length),
    },
    () => consume(),
  );

  await Promise.all(workers);

  return results;
}

function ensurePlaylistMetadata(playlists) {
  let changed = false;
  let fallbackTimestamp = null;

  try {
    fallbackTimestamp = fs.statSync("./playlists.json").mtime.toISOString();
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

    if (
      !playlist.songAddedAt ||
      typeof playlist.songAddedAt !== "object" ||
      Array.isArray(playlist.songAddedAt)
    ) {
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

function savePlaylists(playlists) {
  fs.writeFileSync(
    "./playlists.json",
    JSON.stringify(playlists, null, 2),
    "utf-8",
  );
}

function loadPlaylists() {
  const playlists = JSON.parse(fs.readFileSync("./playlists.json", "utf-8"));

  if (ensurePlaylistMetadata(playlists)) {
    savePlaylists(playlists);
  }

  return playlists;
}

function readDownloads() {
  if (!fs.existsSync(DOWNLOADS_FILE)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(DOWNLOADS_FILE, "utf-8"));
}

function saveDownloads(downloads) {
  fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify(downloads, null, 2), "utf-8");
}

function getUserDownloads(username) {
  const downloads = readDownloads();
  const userDownloads = Array.isArray(downloads[username])
    ? downloads[username]
    : [];

  const validDownloads = userDownloads.filter((download) =>
    fs.existsSync(download.file),
  );

  if (validDownloads.length !== userDownloads.length) {
    downloads[username] = validDownloads;
    saveDownloads(downloads);
  }

  return validDownloads;
}

function readPasswordResets() {
  if (!fs.existsSync(PASSWORD_RESETS_FILE)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(PASSWORD_RESETS_FILE, "utf-8"));
}

function savePasswordResets(resets) {
  fs.writeFileSync(
    PASSWORD_RESETS_FILE,
    JSON.stringify(resets, null, 2),
    "utf-8",
  );
}

function sanitizeFilename(value) {
  return (
    String(value)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/[. ]+$/g, "")
      .trim() || "Unknown"
  );
}

function findGlobalDownload(trackId) {
  const downloads = readDownloads();

  for (const userDownloads of Object.values(downloads)) {
    if (!Array.isArray(userDownloads)) continue;

    const found = userDownloads.find(
      (download) =>
        download.trackId === trackId && fs.existsSync(download.file),
    );

    if (found) {
      return found;
    }
  }

  return null;
}

import session from "express-session";

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

app.get("/me", (req, res) => {
  if (req.session.user) {
    res.status(200).json({
      loggedIn: true,
      user: req.session.user,
    });
  } else {
    res.status(401).json({
      loggedIn: false,
    });
  }
});

app.post("/login", (req, res) => {
  const { identifier, password } = req.body;

  const usersData = fs.readFileSync("./users.json", "utf-8");
  const users = JSON.parse(usersData);

  const foundUser = users.find(
    (u) => u.identifier === identifier || u.email === identifier,
  );

  if (!foundUser || foundUser.password !== password) {
    return res.status(401).json({
      message: "Invalid credentials",
    });
  }

  req.session.user = {
    username: foundUser.identifier,
  };

  return res.status(200).json({
    message: "Login successful",
  });
});

app.post("/signUpPage", (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  const usersData = fs.readFileSync("./users.json", "utf-8");
  const users = JSON.parse(usersData);

  if (password !== confirmPassword) {
    return res.status(400).json({
      message: "Passwords do not match",
    });
  }

  if (!validator.isEmail(email)) {
    return res.status(422).json({
      message: "Must be a valid email",
    });
  }

  const userExists = users.some(
    (u) => u.identifier === username || u.email === email,
  );

  if (userExists) {
    return res.status(409).json({
      message: "Username or Email already taken",
    });
  }

  const newUser = {
    identifier: username,
    email,
    password,
  };

  users.push(newUser);

  fs.writeFileSync("./users.json", JSON.stringify(users, null, 2), "utf-8");

  return res.status(200).json({
    message: "Registration successful",
  });
});

app.get("/home", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const playlists = loadPlaylists();
  const username = req.session.user.username;

  const userPlaylists = playlists.filter(
    (playlist) => playlist.owner === username,
  );

  return res.status(200).json({
    playlists: userPlaylists,
  });
});

app.post("/create", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const playlists = loadPlaylists();
  const username = req.session.user.username;

  let id = playlists.length
    ? Number(playlists[playlists.length - 1].id) + 1
    : 1;

  const now = new Date().toISOString();

  const newPlaylist = {
    name: "My Playlist",
    id,
    cover: "https://picsum.photos/seed/picsum/200/300",
    owner: username,
    status: "private",
    songs: [],
    downloaded: [],
    createdAt: now,
    updatedAt: now,
    songAddedAt: {},
  };

  playlists.push(newPlaylist);
  savePlaylists(playlists);

  return res.status(200).json({
    message: "creation successful",
    playlist: newPlaylist,
  });
});

app.patch("/home/playlist/:id", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const playlists = loadPlaylists();
  const reqId = Number(req.params.id);
  const username = req.session.user.username;

  const playlist = playlists.find(
    (playlist) => playlist.id === reqId && playlist.owner === username,
  );

  if (!playlist) {
    return res.status(404).json({
      message: "Playlist not found",
    });
  }

  const { name, description, status, cover } = req.body;

  if (name !== undefined) {
    playlist.name = name;
  }

  if (description !== undefined) {
    playlist.description = description;
  }

  if (status !== undefined) {
    playlist.status = status;
  }

  if (cover !== undefined) {
    playlist.cover = cover;
  }

  playlist.updatedAt = new Date().toISOString();

  savePlaylists(playlists);

  return res.status(200).json(playlist);
});

app.delete("/home/playlist/:id", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const playlists = loadPlaylists();
  const reqId = Number(req.params.id);
  const username = req.session.user.username;

  const playlistExists = playlists.some(
    (playlist) => playlist.id === reqId && playlist.owner === username,
  );

  if (!playlistExists) {
    return res.status(404).json({
      message: "Playlist not found or access denied",
    });
  }

  const newPlaylists = playlists.filter((playlist) => playlist.id !== reqId);

  savePlaylists(newPlaylists);

  return res.status(200).json({
    message: "Playlist deleted successfully",
  });
});

async function getSpotifyToken() {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
        ).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const error = await response.json();

    throw new Error(error.error_description || "failed to fetch token");
  }

  const data = await response.json();

  return data.access_token;
}

app.get("/search", async (req, res) => {
  try {
    const token = await getSpotifyToken();
    const userSearch = req.query.q;

    if (!userSearch) {
      return res.status(400).json({
        message: "Missing search query",
      });
    }

    const tracks = [];
    const artists = [];
    const albums = [];

    let offset = 0;
    const limit = 10;
    const maxRequests = 10;

    while (
      tracks.length + artists.length + albums.length < 50 &&
      offset < maxRequests * limit
    ) {
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(
          userSearch,
        )}&type=track,artist,album&limit=${limit}&offset=${offset}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      if (data.tracks?.items) {
        tracks.push(...data.tracks.items);
      }

      if (data.artists?.items) {
        artists.push(...data.artists.items);
      }

      if (data.albums?.items) {
        albums.push(...data.albums.items);
      }

      offset += limit;

      if (
        !data.tracks?.items?.length &&
        !data.artists?.items?.length &&
        !data.albums?.items?.length
      ) {
        break;
      }
    }

    const selectedArtists = artists.slice(0, 5);
    const selectedAlbums = albums.slice(0, 5);

    const remainingSlots = 50 - selectedArtists.length - selectedAlbums.length;

    const selectedTracks = tracks.slice(0, remainingSlots);

    const downloadedIds = req.session.user
      ? new Set(
          getUserDownloads(req.session.user.username).map(
            (download) => download.trackId,
          ),
        )
      : new Set();

    const tracksWithDownloadState = selectedTracks.map((track) => ({
      ...track,
      downloaded: downloadedIds.has(track.id),
    }));

    res.json({
      tracks: {
        items: tracksWithDownloadState,
      },
      artists: {
        items: selectedArtists,
      },
      albums: {
        items: selectedAlbums,
      },
    });
  } catch (error) {
    console.error("Spotify search error:", error);

    res.status(500).json({
      message: error.message,
    });
  }
});

app.post("/add/:id", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const reqId = Number(req.params.id);
  const { trackId } = req.body;
  const username = req.session.user.username;

  const playlists = loadPlaylists();

  const targetPlaylist = playlists.find(
    (playlist) => playlist.id === reqId && playlist.owner === username,
  );

  if (!targetPlaylist) {
    return res.status(404).json({
      message: "Playlist not found",
    });
  }

  if (!trackId) {
    return res.status(400).json({
      message: "Missing track ID",
    });
  }

  if (targetPlaylist.songs.includes(trackId)) {
    return res.status(409).json({
      message: "Song already in the playlist",
    });
  }

  targetPlaylist.songs.push(trackId);

  if (!targetPlaylist.songAddedAt) {
    targetPlaylist.songAddedAt = {};
  }

  targetPlaylist.songAddedAt[trackId] = new Date().toISOString();

  targetPlaylist.updatedAt = new Date().toISOString();

  const userDownloads = getUserDownloads(username);

  if (userDownloads.some((download) => download.trackId === trackId)) {
    if (!Array.isArray(targetPlaylist.downloaded)) {
      targetPlaylist.downloaded = [];
    }

    if (!targetPlaylist.downloaded.includes(trackId)) {
      targetPlaylist.downloaded.push(trackId);
    }
  }

  savePlaylists(playlists);

  return res.status(200).json({
    message: "Added successfully",
    addedAt: targetPlaylist.songAddedAt[trackId],
  });
});

app.get("/home/playlist/:id/tracks", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  try {
    const reqId = Number(req.params.id);
    const username = req.session.user.username;
    const playlists = loadPlaylists();

    const targetPlaylist = playlists.find(
      (playlist) => playlist.id === reqId && playlist.owner === username,
    );

    if (!targetPlaylist) {
      return res.status(404).json({
        message: "Playlist not found",
      });
    }

    const songs = Array.isArray(targetPlaylist.songs)
      ? targetPlaylist.songs
      : [];

    if (songs.length === 0) {
      return res.status(200).json([]);
    }

    const token = await getSpotifyToken();
    const userDownloads = getUserDownloads(username);

    const downloadedIds = new Set(
      userDownloads.map((download) => download.trackId),
    );

    const tracks = [];

    for (const id of songs) {
      const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data || !data.id) {
        console.error("SPOTIFY TRACK ERROR:", id, response.status, data);

        continue;
      }

      tracks.push({
        ...data,
        downloaded: downloadedIds.has(id),
        addedAt: targetPlaylist.songAddedAt?.[id] || targetPlaylist.createdAt,
      });
    }

    return res.json(tracks);
  } catch (error) {
    console.error("Failed to get playlist tracks:", error);

    return res.status(500).json({
      message: error.message,
    });
  }
});

app.delete("/add/:id", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const reqId = Number(req.params.id);
  const { trackId } = req.body;
  const username = req.session.user.username;

  const playlists = loadPlaylists();

  const targetPlaylist = playlists.find(
    (playlist) => playlist.id === reqId && playlist.owner === username,
  );

  if (!targetPlaylist) {
    return res.status(404).json({
      message: "Playlist not found",
    });
  }

  if (!trackId) {
    return res.status(400).json({
      message: "Missing track ID",
    });
  }

  const songIndex = targetPlaylist.songs.indexOf(trackId);

  if (songIndex === -1) {
    return res.status(404).json({
      message: "Song is not in the playlist",
    });
  }

  targetPlaylist.songs.splice(songIndex, 1);

  if (targetPlaylist.songAddedAt) {
    delete targetPlaylist.songAddedAt[trackId];
  }

  targetPlaylist.updatedAt = new Date().toISOString();

  if (Array.isArray(targetPlaylist.downloaded)) {
    targetPlaylist.downloaded = targetPlaylist.downloaded.filter(
      (id) => id !== trackId,
    );
  }

  fs.writeFileSync(
    "./playlists.json",
    JSON.stringify(playlists, null, 2),
    "utf-8",
  );

  return res.status(200).json({
    message: "Removed successfully",
  });
});

app.delete("/playlist/:id", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const reqId = Number(req.params.id);
  const username = req.session.user.username;

  const { trackId } = req.body;

  const playlists = loadPlaylists();

  const targetPlaylist = playlists.find(
    (playlist) => playlist.id === reqId && playlist.owner === username,
  );

  if (!targetPlaylist) {
    return res.status(404).json({
      message: "Playlist not found",
    });
  }

  const songIndex = targetPlaylist.songs.indexOf(trackId);

  if (songIndex === -1) {
    return res.status(404).json({
      message: "Song is not in the playlist",
    });
  }

  targetPlaylist.songs.splice(songIndex, 1);

  if (targetPlaylist.songAddedAt) {
    delete targetPlaylist.songAddedAt[trackId];
  }

  targetPlaylist.updatedAt = new Date().toISOString();

  if (Array.isArray(targetPlaylist.downloaded)) {
    targetPlaylist.downloaded = targetPlaylist.downloaded.filter(
      (id) => id !== trackId,
    );
  }

  fs.writeFileSync(
    "./playlists.json",
    JSON.stringify(playlists, null, 2),
    "utf-8",
  );

  return res.status(200).json({
    message: "Removed successfully",
  });
});

app.patch("/playlist/:id/downloaded", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const reqId = Number(req.params.id);

  const username = req.session.user.username;

  const { trackId, trackIds, all } = req.body;

  const playlists = loadPlaylists();

  const targetPlaylist = playlists.find(
    (playlist) => playlist.id === reqId && playlist.owner === username,
  );

  if (!targetPlaylist) {
    return res.status(404).json({
      message: "Playlist not found",
    });
  }

  let idsToMark;

  if (all) {
    idsToMark = targetPlaylist.songs;
  } else if (Array.isArray(trackIds)) {
    idsToMark = trackIds;
  } else if (trackId) {
    idsToMark = [trackId];
  } else {
    return res.status(400).json({
      message: "Provide trackId, trackIds, or all",
    });
  }

  const existing = Array.isArray(targetPlaylist.downloaded)
    ? targetPlaylist.downloaded
    : [];

  const merged = new Set([...existing, ...idsToMark]);

  targetPlaylist.downloaded = Array.from(merged).filter((id) =>
    targetPlaylist.songs.includes(id),
  );

  targetPlaylist.updatedAt = new Date().toISOString();

  savePlaylists(playlists);

  return res.status(200).json({
    downloaded: targetPlaylist.downloaded,
  });
});

app.get("/downloads", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const username = req.session.user.username;

  const userDownloads = getUserDownloads(username);

  return res.status(200).json({
    downloads: userDownloads.map((download) => download.trackId),
  });
});

app.post("/song/download", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const { name, artist, trackId } = req.body;

  const username = req.session.user.username;

  if (!name || !artist || !trackId) {
    return res.status(400).json({
      message: "Missing song name, artist, or track ID",
    });
  }

  const existingDownloads = getUserDownloads(username);

  const alreadyDownloaded = existingDownloads.find(
    (download) => download.trackId === trackId,
  );

  if (alreadyDownloaded) {
    return res.status(200).json({
      message: "Song already downloaded",
      downloaded: true,
      trackId,
      file: alreadyDownloaded.file,
    });
  }

  const globalDownload = findGlobalDownload(trackId);

  if (globalDownload) {
    const downloads = readDownloads();

    if (!Array.isArray(downloads[username])) {
      downloads[username] = [];
    }

    downloads[username].push({
      trackId,
      name,
      artist,
      file: globalDownload.file,
      youtubeId: globalDownload.youtubeId,
    });

    saveDownloads(downloads);

    return res.status(200).json({
      message: "Song already downloaded",
      downloaded: true,
      trackId,
      file: globalDownload.file,
    });
  }

  const trackQuery = `${name} ${artist}`;

  const search = spawn("yt-dlp", [
    "--skip-download",
    "--flat-playlist",
    "--print",
    "%(id)s|%(title)s|%(uploader)s|%(webpage_url)s",
    `ytsearch5:${trackQuery}`,
  ]);

  let outputData = "";

  search.stdout.on("data", (data) => {
    outputData += data.toString();
  });

  search.stderr.on("data", (data) => {
    console.log("yt-dlp:", data.toString().trim());
  });

  search.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({
        message: "YouTube search failed",
      });
    }

    const results = outputData
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, title, uploader, url] = line.split("|");

        return {
          id,
          title,
          uploader,
          url,
        };
      });

    if (results.length === 0) {
      return res.status(404).json({
        message: "Song not found",
      });
    }

    const matchedVideo = results.find((video) =>
      video.uploader.toLowerCase().includes(artist.toLowerCase()),
    );

    const video = matchedVideo || results[0];

    const safeArtist = sanitizeFilename(artist);

    const safeName = sanitizeFilename(name);

    let filename = `${safeArtist} - ${safeName}.mp3`;

    let mp3File = path.join(DOWNLOAD_DIR, filename);

    if (fs.existsSync(mp3File)) {
      filename = `${safeArtist} - ${safeName} [${video.id}].mp3`;

      mp3File = path.join(DOWNLOAD_DIR, filename);
    }

    const outputTemplate = path.join(
      DOWNLOAD_DIR,
      filename.replace(/\.mp3$/i, ".%(ext)s"),
    );

    const download = spawn("yt-dlp", [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--output",
      outputTemplate,
      video.url,
    ]);

    download.stdout.on("data", (data) => {
      console.log(data.toString().trim());
    });

    download.stderr.on("data", (data) => {
      console.log("yt-dlp:", data.toString().trim());
    });

    download.on("close", (exitCode) => {
      if (exitCode !== 0 || !fs.existsSync(mp3File)) {
        return res.status(500).json({
          message: "Download failed",
        });
      }

      const downloads = readDownloads();

      if (!Array.isArray(downloads[username])) {
        downloads[username] = [];
      }

      downloads[username] = [
        ...downloads[username].filter(
          (download) => download.trackId !== trackId,
        ),
        {
          trackId,
          name,
          artist,
          file: mp3File,
          youtubeId: video.id,
        },
      ];

      saveDownloads(downloads);

      return res.status(200).json({
        message: "Download successful",
        title: video.title,
        downloaded: true,
        trackId,
        file: mp3File,
      });
    });
  });
});
app.post("/song/preload", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : [];

  const normalizedTracks = tracks
    .map((track) => ({
      id: String(track?.id || ""),
      name: String(track?.name || ""),
      artist: String(track?.artist || track?.artists?.[0]?.name || ""),
      downloaded: Boolean(track?.downloaded),
    }))
    .filter(
      (track) => track.id && track.name && track.artist && !track.downloaded,
    );

  if (!normalizedTracks.length) {
    return res.status(200).json({
      results: [],
    });
  }

  const results = await runWithConcurrency(
    normalizedTracks,
    PLAYBACK_PRELOAD_CONCURRENCY,
    async (track) => {
      const cached = readPlaybackCache(track.id);

      if (cached) {
        return {
          trackId: track.id,
          ok: true,
          cached: true,
        };
      }

      try {
        await getOrCreatePlaybackUrl(track.id, track.name, track.artist);

        return {
          trackId: track.id,
          ok: true,
          cached: false,
        };
      } catch (error) {
        console.error("PLAYBACK PRELOAD FAILED:", track.id, error.message);

        return {
          trackId: track.id,
          ok: false,
          error: error.message,
        };
      }
    },
  );

  return res.status(200).json({
    results,
  });
});

app.get("/song/stream/:trackId", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const username = req.session.user.username;
  const trackId = req.params.trackId;
  const userDownloads = getUserDownloads(username);

  const download = userDownloads.find((item) => item.trackId === trackId);

  if (download?.file) {
    return res.status(200).json({
      url: `http://localhost:${PORT}/song/file/${encodeURIComponent(trackId)}`,
      downloaded: true,
    });
  }

  const { name, artist } = req.query;

  if (!name || !artist) {
    return res.status(400).json({
      message: "Track name and artist are required for online playback",
    });
  }

  try {
    const forceRefresh = req.query.refresh === "1";

    const result = await getOrCreatePlaybackUrl(
      trackId,
      name,
      artist,
      forceRefresh,
    );

    return res.status(200).json({
      url: result.url,
      downloaded: false,
      cached: result.cached,
    });
  } catch (error) {
    console.error("PLAYBACK URL ERROR:", error);

    return res.status(500).json({
      message: "Failed to prepare audio playback",
      error: error.message,
    });
  }
});

app.get("/song/file/:trackId", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const username = req.session.user.username;
  const trackId = req.params.trackId;
  const userDownloads = getUserDownloads(username);

  const download = userDownloads.find((item) => item.trackId === trackId);

  if (!download?.file) {
    return res.status(404).json({
      message: "Downloaded song not found",
    });
  }

  const resolvedFile = path.resolve(download.file);
  const resolvedDownloadDir = path.resolve(DOWNLOAD_DIR);

  if (
    resolvedFile !== resolvedDownloadDir &&
    !resolvedFile.startsWith(`${resolvedDownloadDir}${path.sep}`)
  ) {
    return res.status(403).json({
      message: "Invalid download path",
    });
  }

  if (!fs.existsSync(resolvedFile)) {
    return res.status(404).json({
      message: "Downloaded file no longer exists",
    });
  }

  return res.sendFile(resolvedFile);
});

app.get("/lyrics/:trackId", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const trackId = req.params.trackId;
  const cached = lyricsCache.get(trackId);

  if (cached && cached.expiresAt > Date.now()) {
    return res.status(200).json(cached.data);
  }

  if (cached) {
    lyricsCache.delete(trackId);
  }

  try {
    const response = await fetch(
      `${LYRICSTIFY_API_URL}/${encodeURIComponent(trackId)}`,
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        message: data?.message || "Lyrics unavailable",
      });
    }

    lyricsCache.set(trackId, {
      data,
      expiresAt: Date.now() + LYRIC_CACHE_TTL_MS,
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error("LYRICSTIFY ERROR:", error);

    return res.status(502).json({
      message: "Lyrics service unavailable",
    });
  }
});

app.delete("/song/download/:trackId", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const username = req.session.user.username;

  const trackId = req.params.trackId;

  const downloads = readDownloads();

  const userDownloads = Array.isArray(downloads[username])
    ? downloads[username]
    : [];

  const download = userDownloads.find((item) => item.trackId === trackId);

  if (!download) {
    return res.status(404).json({
      message: "Downloaded song not found",
    });
  }

  downloads[username] = userDownloads.filter(
    (item) => item.trackId !== trackId,
  );

  const stillUsed = Object.values(downloads).some(
    (userDownloads) =>
      Array.isArray(userDownloads) &&
      userDownloads.some((item) => item.file === download.file),
  );

  if (!stillUsed && fs.existsSync(download.file)) {
    fs.unlinkSync(download.file);
  }

  saveDownloads(downloads);

  const playlists = loadPlaylists();

  for (const playlist of playlists) {
    if (playlist.owner !== username) {
      continue;
    }

    if (Array.isArray(playlist.downloaded)) {
      playlist.downloaded = playlist.downloaded.filter((id) => id !== trackId);
      playlist.updatedAt = new Date().toISOString();
    }
  }

  savePlaylists(playlists);

  return res.status(200).json({
    message: "Download deleted",
    downloaded: false,
    trackId,
  });
});

app.post("/forgotPassword", (req, res) => {
  const { email } = req.body;

  if (!email || !validator.isEmail(email)) {
    return res.status(422).json({
      message: "Must be a valid email",
    });
  }

  const usersData = fs.readFileSync("./users.json", "utf-8");

  const users = JSON.parse(usersData);

  const user = users.find((candidate) => candidate.email === email);

  if (!user) {
    return res.status(200).json({
      message: "If that email exists, a reset link has been generated.",
    });
  }

  const token = crypto.randomBytes(24).toString("hex");

  const resets = readPasswordResets();

  resets[token] = {
    username: user.identifier,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  savePasswordResets(resets);

  return res.status(200).json({
    message:
      "Reset link generated. This local development build does not send email.",
    resetUrl: `http://localhost:5173/resetPasswordPage?token=${token}`,
  });
});

app.post("/resetPassword", (req, res) => {
  const { token, password } = req.body;

  if (!token || !password || password.length < 6) {
    return res.status(400).json({
      message:
        "A valid token and a password of at least 6 characters are required",
    });
  }

  const resets = readPasswordResets();

  const reset = resets[token];

  if (!reset || reset.expiresAt < Date.now()) {
    if (reset) {
      delete resets[token];
      savePasswordResets(resets);
    }

    return res.status(400).json({
      message: "Reset link is invalid or expired",
    });
  }

  const usersData = fs.readFileSync("./users.json", "utf-8");

  const users = JSON.parse(usersData);

  const user = users.find(
    (candidate) => candidate.identifier === reset.username,
  );

  if (!user) {
    delete resets[token];

    savePasswordResets(resets);

    return res.status(404).json({
      message: "User not found",
    });
  }

  user.password = password;

  fs.writeFileSync("./users.json", JSON.stringify(users, null, 2), "utf-8");

  delete resets[token];

  savePasswordResets(resets);

  return res.status(200).json({
    message: "Password reset successful",
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: "Logout failed",
      });
    }

    res.clearCookie("connect.sid");

    return res.status(200).json({
      message: "Logout successful",
    });
  });
});

let playing = null;
let mpvProcess = null;

app.post("/stream", (req, res) => {
  const { track } = req.body;

  if (mpvProcess) {
    mpvProcess.kill;
  }

  const ytdlp = spawn("yt-dlp", [
    "-f",
    "bestaudio",
    "o",
    "-",
    "--quiet",
    "--no-warnings",
  ]);

  const mpv = spawn("mpv", [
    "--no-videp",
    "cache=yes",
    "--input-ipc-server=/tmp/mpv-socket",
    "-",
  ]);

  ytdlp.stdout.pipe(mpv.stdin);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
