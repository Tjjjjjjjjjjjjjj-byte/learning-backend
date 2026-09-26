// API routes for this feature area.
export function registerRoutes(app, context) {
  const { fs, path, spawn, PORT, DOWNLOAD_DIR, getUserDownloads, findGlobalDownload, readDownloads, saveDownloads, sanitizeFilename, findYoutubeVideo, getOrCreatePlaybackUrl, readPlaybackCache, runWithConcurrency, PLAYBACK_PRELOAD_CONCURRENCY } = context;

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

app.post("/song/download", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const { name, artist, trackId } = req.body;
  const requestedDurationMs = Number(req.body?.duration_ms ?? req.body?.durationMs);
  const requestedDurationSeconds =
    Number.isFinite(requestedDurationMs) && requestedDurationMs > 0
      ? requestedDurationMs / 1000
      : null;

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

  let video;

  try {
    video = await findYoutubeVideo(
      name,
      artist,
      requestedDurationSeconds,
    );
  } catch (error) {
    console.error("YOUTUBE SEARCH FAILED:", error.message);
    return res.status(500).json({
      message: "YouTube search failed",
    });
  }

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
      durationSeconds: Number(track?.duration_ms) / 1000,
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
        await getOrCreatePlaybackUrl(
          track.id,
          track.name,
          track.artist,
          Number.isFinite(track.durationSeconds) && track.durationSeconds > 0
            ? track.durationSeconds
            : null,
        );

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
  const durationMs = Number(req.query.durationMs);
  const durationSeconds =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : null;

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
      durationSeconds,
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
}
