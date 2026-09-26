// API routes for this feature area.
export function registerRoutes(app, context) {
  const { fs, path, PROJECT_ROOT, loadPlaylists, savePlaylists, getUserDownloads, getSpotifyToken } = context;

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
    path.join(PROJECT_ROOT, "playlists.json"),
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
    path.join(PROJECT_ROOT, "playlists.json"),
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
}
