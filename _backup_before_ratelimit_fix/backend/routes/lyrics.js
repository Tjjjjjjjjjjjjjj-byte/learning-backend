// API routes for this feature area.
export function registerRoutes(app, context) {
  const { getSpotifyTrackForLyrics, parseLrcLyrics, LYRIC_CACHE_TTL_MS, lyricsCache } = context;

app.get("/lyrics/:trackId", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Must be logged in",
    });
  }

  const trackId = req.params.trackId;

  if (!trackId) {
    return res.status(400).json({
      message: "Missing track ID",
    });
  }

  const cached = lyricsCache.get(trackId);

  if (cached && cached.expiresAt > Date.now()) {
    return res.status(200).json(cached.data);
  }

  if (cached) {
    lyricsCache.delete(trackId);
  }

  try {
    const track = await getSpotifyTrackForLyrics(trackId);

    if (!track) {
      console.warn("LYRICS: Spotify track not found:", trackId);
      return res.status(200).json({
        lyrics: {
          lines: [],
        },
      });
    }

    const artistName = Array.isArray(track.artists)
      ? track.artists
          .map((artist) => artist?.name)
          .filter(Boolean)
          .join(", ")
      : "";

    const trackName = String(track.name || "").trim();
    const albumName = String(track.album?.name || "").trim();
    const durationSeconds = Number(track.duration_ms) / 1000;

    if (
      !trackName ||
      !artistName ||
      !albumName ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      /*
       * A totally blank result (no name, no artists, no album at all)
       * means Spotify's embed page didn't actually resolve -- almost
       * always because we're being rate-limited right at this moment,
       * not because the track has no metadata. That's transient and
       * worth retrying; a partially-populated result is more likely a
       * genuinely unusual track and isn't worth retrying forever.
       */
      const isTransient = !trackName && !artistName && !albumName;

      console.warn(
        `LYRICS: Incomplete Spotify metadata${isTransient ? " (transient)" : ""}:`,
        trackId,
      );

      return res.status(200).json({
        lyrics: {
          lines: [],
        },
        status: isTransient ? "retry" : "unavailable",
      });
    }

    const lrclibUrl = new URL("https://lrclib.net/api/get");
    lrclibUrl.searchParams.set("track_name", trackName);
    lrclibUrl.searchParams.set("artist_name", artistName);
    lrclibUrl.searchParams.set("album_name", albumName);
    lrclibUrl.searchParams.set("duration", String(durationSeconds));

    const response = await fetch(lrclibUrl, {
      headers: {
        Accept: "application/json",
        "Lrclib-Client": "learning-backend",
      },
    });

    if (response.status === 404) {
      return res.status(200).json({
        lyrics: {
          lines: [],
        },
      });
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error(
        "LRCLIB REQUEST FAILED:",
        response.status,
        data?.message || "Unknown LRCLIB error",
      );

      return res.status(502).json({
        message: "Lyrics service unavailable",
      });
    }

    const lines = parseLrcLyrics(data?.syncedLyrics);

    if (!lines.length) {
      return res.status(200).json({
        lyrics: {
          lines: [],
        },
      });
    }

    const result = {
      lyrics: {
        lines,
      },
    };

    lyricsCache.set(trackId, {
      data: result,
      expiresAt: Date.now() + LYRIC_CACHE_TTL_MS,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error?.status === 429) {
      const retryAfterSeconds = Number(error.retryAfterSeconds);

      console.warn(
        `LYRICS: Spotify rate limit detected for ${trackId}; using existing retry/loading flow`,
      );

      return res.status(200).json({
        lyrics: { lines: [] },
        status: "retry",
        ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? { retryAfterSeconds }
          : {}),
      });
    }

    console.error(
      "LYRICS LOAD ERROR:",
      error instanceof Error ? error.message : error,
    );

    return res.status(502).json({
      message: "Lyrics service unavailable",
    });
  }
});
}