// API routes for lyrics.
//
// The client already knows the track's name / artists / album / duration
// (it just played it), so it sends them along. That means lyrics no longer
// depend on a Spotify lookup at all -- which is what used to fail (rate
// limits, 403s, blank embed pages) and surface as "Lyrics unavailable" for
// searched tracks. Spotify is only used as a fallback when the client sent
// nothing usable.

const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const LRCLIB_TIMEOUT_MS = 8000;
const DURATION_MATCH_WINDOW_S = 8;

function cleanString(value) {
  return String(value ?? "").trim().slice(0, 200);
}

function lrclibHeaders() {
  return {
    Accept: "application/json",
    "Lrclib-Client": "learning-backend",
  };
}

async function lrclibGet(meta) {
  const url = new URL("https://lrclib.net/api/get");
  url.searchParams.set("track_name", meta.trackName);
  url.searchParams.set("artist_name", meta.artistName);
  if (meta.albumName) url.searchParams.set("album_name", meta.albumName);
  if (meta.durationSeconds) {
    url.searchParams.set("duration", String(Math.round(meta.durationSeconds)));
  }

  const response = await fetch(url, {
    headers: lrclibHeaders(),
    signal: AbortSignal.timeout(LRCLIB_TIMEOUT_MS),
  });

  if (response.status === 404) return { data: null };

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || `LRCLIB HTTP ${response.status}`);
    error.lrclibStatus = response.status;
    throw error;
  }

  return { data };
}

/*
 * /api/get needs an exact track+artist+album+duration match, so it 404s for
 * a lot of real tracks (album name differs, live/remaster duration, "feat."
 * artists...). /api/search is fuzzy: take the result whose duration is
 * closest to ours and that actually has synced lyrics.
 */
async function lrclibSearch(meta) {
  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("track_name", meta.trackName);
  url.searchParams.set("artist_name", meta.primaryArtist || meta.artistName);

  const response = await fetch(url, {
    headers: lrclibHeaders(),
    signal: AbortSignal.timeout(LRCLIB_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  const results = await response.json().catch(() => null);
  if (!Array.isArray(results)) return null;

  const withSynced = results.filter(
    (item) => typeof item?.syncedLyrics === "string" && item.syncedLyrics.trim(),
  );

  if (!withSynced.length) return null;

  if (!meta.durationSeconds) return withSynced[0];

  const scored = withSynced
    .map((item) => ({
      item,
      diff: Math.abs(Number(item.duration) - meta.durationSeconds),
    }))
    .filter((entry) => Number.isFinite(entry.diff))
    .sort((a, b) => a.diff - b.diff);

  return scored.length && scored[0].diff <= DURATION_MATCH_WINDOW_S
    ? scored[0].item
    : null;
}

export function registerRoutes(app, context) {
  const { getSpotifyTrackForLyrics, parseLrcLyrics, LYRIC_CACHE_TTL_MS, lyricsCache } = context;

  function cacheResult(trackId, data, ttl) {
    lyricsCache.set(trackId, { data, expiresAt: Date.now() + ttl });
  }

  app.get("/lyrics/:trackId", async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Must be logged in" });
    }

    const trackId = req.params.trackId;

    if (!trackId) {
      return res.status(400).json({ message: "Missing track ID" });
    }

    const cached = lyricsCache.get(trackId);

    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json(cached.data);
    }

    if (cached) lyricsCache.delete(trackId);

    try {
      // 1) Metadata the client already has.
      let meta = {
        trackName: cleanString(req.query.name),
        artistName: cleanString(req.query.artist),
        primaryArtist: cleanString(req.query.primaryArtist),
        albumName: cleanString(req.query.album),
        durationSeconds: Number(req.query.durationMs) / 1000,
      };

      // 2) Only if that's not usable, ask Spotify (may be rate limited).
      if (!meta.trackName || !meta.artistName) {
        const track = await getSpotifyTrackForLyrics(trackId);

        if (!track) {
          console.warn("LYRICS: Spotify track not found:", trackId);
          cacheResult(trackId, { lyrics: { lines: [] } }, NEGATIVE_TTL_MS);
          return res.status(200).json({ lyrics: { lines: [] } });
        }

        const artistNames = Array.isArray(track.artists)
          ? track.artists.map((artist) => artist?.name).filter(Boolean)
          : [];

        meta = {
          trackName: cleanString(track.name),
          artistName: cleanString(artistNames.join(", ")),
          primaryArtist: cleanString(artistNames[0]),
          albumName: cleanString(track.album?.name),
          durationSeconds: Number(track.duration_ms) / 1000,
        };

        // A totally blank result means Spotify's page didn't really
        // resolve (almost always a rate limit right now): retry, don't
        // report "unavailable".
        if (!meta.trackName && !meta.artistName && !meta.albumName) {
          console.warn("LYRICS: blank Spotify metadata (transient):", trackId);
          return res.status(200).json({ lyrics: { lines: [] }, status: "retry" });
        }

        if (!meta.trackName || !meta.artistName) {
          console.warn("LYRICS: no usable name/artist:", trackId);
          return res.status(200).json({ lyrics: { lines: [] }, status: "unavailable" });
        }
      }

      if (!Number.isFinite(meta.durationSeconds) || meta.durationSeconds <= 0) {
        meta.durationSeconds = null;
      }

      // 3) LRCLIB: exact match first, fuzzy search as fallback.
      let match = null;

      const exact = await lrclibGet(meta);
      if (exact.data?.syncedLyrics) match = exact.data;

      if (!match) match = await lrclibSearch(meta);

      const lines = parseLrcLyrics(match?.syncedLyrics);

      if (!lines.length) {
        cacheResult(trackId, { lyrics: { lines: [] } }, NEGATIVE_TTL_MS);
        return res.status(200).json({ lyrics: { lines: [] } });
      }

      const result = { lyrics: { lines } };
      cacheResult(trackId, result, LYRIC_CACHE_TTL_MS);

      return res.status(200).json(result);
    } catch (error) {
      if (error?.status === 429) {
        const retryAfterSeconds = Number(error.retryAfterSeconds);

        console.warn(`LYRICS: Spotify rate limit for ${trackId}; asking client to retry`);

        if (Number.isFinite(retryAfterSeconds)) {
          res.set("Retry-After", String(retryAfterSeconds));
        }

        return res.status(200).json({
          lyrics: { lines: [] },
          status: "retry",
          ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
            ? { retryAfterSeconds }
            : {}),
        });
      }

      // LRCLIB down / timed out: transient, keep the loading state.
      if (error?.name === "TimeoutError" || error?.lrclibStatus >= 500) {
        console.warn("LYRICS: LRCLIB unavailable:", error.message);
        return res.status(200).json({ lyrics: { lines: [] }, status: "retry" });
      }

      console.error("LYRICS LOAD ERROR:", error instanceof Error ? error.message : error);

      return res.status(502).json({ message: "Lyrics service unavailable" });
    }
  });
}
