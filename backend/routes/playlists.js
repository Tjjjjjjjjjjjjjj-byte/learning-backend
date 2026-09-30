// API routes for this feature area.
import { getTracksByIds } from "../services/spotifyTracks.js";
import { sendSpotifyError } from "../services/spotifyHttp.js";

export function registerRoutes(app, context) {
  const {
    loadPlaylists,
    savePlaylists,
    nextPlaylistId,
    loadSpotifyPublicPlaylists,
    getUserDownloads,
    getSpotifyToken,
    recordRecentPlaylist,
    getRecentPlaylistIds,
  } = context;

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

  const savedPublicPlaylists = loadSpotifyPublicPlaylists();
  const publicPlaylists = Array.isArray(savedPublicPlaylists[username])
    ? savedPublicPlaylists[username]
    : [];

  // Position in the user's recently-played list (0 = most recent) so the
  // library can sort by "Recents".
  const recentIds =
    typeof getRecentPlaylistIds === "function"
      ? getRecentPlaylistIds(username, 30).map(String)
      : [];

  const withRank = (playlist) => {
    const index = recentIds.indexOf(String(playlist.id));
    return { ...playlist, recentRank: index === -1 ? null : index };
  };

  return res.status(200).json({
    playlists: [...userPlaylists, ...publicPlaylists].map(withRank),
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

  const id = nextPlaylistId();

  const now = new Date().toISOString();

  const newPlaylist = {
    name: "My Playlist",
    id,
    cover: "https://picsum.photos/seed/picsum/200/300",
    owner: username,
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

  const { name, description, cover } = req.body;

  if (name !== undefined) {
    playlist.name = name;
  }

  if (description !== undefined) {
    playlist.description = description;
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

    // This endpoint is only called when App.jsx is about to start playing
    // this playlist, so it's a reliable "the user played this" signal for
    // the home dashboard's Recents row.
    if (typeof recordRecentPlaylist === "function") {
      recordRecentPlaylist(username, targetPlaylist.id);
    }

    const songs = Array.isArray(targetPlaylist.songs)
      ? targetPlaylist.songs
      : [];

    if (songs.length === 0) {
      return res.status(200).json([]);
    }

    const userDownloads = getUserDownloads(username);

    const downloadedIds = new Set(
      userDownloads.map((download) => download.trackId),
    );

    // Shared resolver: 24h per-track cache, official batch endpoint only
    // when it works, embed fallback with capped concurrency, and it stops
    // hammering Spotify once a 429 is seen.
    const {
      tracks: officialTracksById,
      missingIds,
      rateLimited,
      retryAfterSeconds,
    } = await getTracksByIds(songs);

    // Don't silently return a playlist with tracks missing because of a
    // 429: tell the client to retry. Everything resolved so far is cached,
    // so each retry only needs the remainder and converges quickly.
    if (rateLimited && missingIds.length > 0) {
      res.set("Retry-After", String(retryAfterSeconds || 5));

      return res.status(429).json({
        message: "Spotify is rate-limiting requests. Retrying shortly.",
        rateLimited: true,
        retryAfterSeconds: retryAfterSeconds || 5,
        resolved: officialTracksById.size,
        total: songs.length,
      });
    }

    const tracks = [];

    for (const id of songs) {
      const data = officialTracksById.get(id);

      if (!data) {
        console.error("SPOTIFY TRACK MISSING FROM BATCH:", id);
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

    return sendSpotifyError(res, error, "Failed to get playlist tracks");
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

  savePlaylists(playlists);

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

  savePlaylists(playlists);

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
}