import { useEffect, useState } from "react";
import { getRetryDelayMs } from "./retryDelay.js";

// Shared across every place lyrics are shown (the mini panel and the
// dedicated fullscreen view) so a track looked up by one is already cached
// for the other.
const lyricsCache = new Map();

/*
 * Fetches and keeps in sync the synced lyrics for `currentTrack`, tracking
 * which line is active for `currentTime` (seconds). Handles the "Spotify
 * is rate limited" retry loop so every lyrics UI in the app behaves the
 * same way.
 */
export function useLyrics(currentTrack, currentTime) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);

  useEffect(() => {
    const trackId = currentTrack?.id;

    setActiveLine(-1);

    if (!trackId) {
      setLines([]);
      setUnavailable(false);
      setLoading(false);
      return;
    }

    if (lyricsCache.has(trackId)) {
      const cachedLines = lyricsCache.get(trackId);

      setLines(cachedLines);
      setUnavailable(cachedLines.length === 0);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let retryTimeout = null;
    let retryCount = 0;
    const MAX_RETRIES = 6;

    setLines([]);
    setUnavailable(false);
    setLoading(true);

    async function loadLyrics() {
      if (controller.signal.aborted) return;

      try {
        // Send what we already know about the track so the backend doesn't
        // have to ask (rate-limited) Spotify for it again.
        const params = new URLSearchParams();
        const artistNames = (currentTrack.artists || [])
          .map((artist) => artist?.name)
          .filter(Boolean);

        if (currentTrack.name) params.set("name", currentTrack.name);
        if (artistNames.length) {
          params.set("artist", artistNames.join(", "));
          params.set("primaryArtist", artistNames[0]);
        }
        if (currentTrack.album?.name) params.set("album", currentTrack.album.name);
        if (Number(currentTrack.duration_ms) > 0) {
          params.set("durationMs", String(Math.round(Number(currentTrack.duration_ms))));
        }

        const response = await fetch(
          `http://localhost:3000/lyrics/${encodeURIComponent(trackId)}?${params}`,
          {
            credentials: "include",
            signal: controller.signal,
          },
        );

        const data = await response.json().catch(() => null);

        /*
         * A failed request or an explicit "retry" status both mean
         * Spotify's lookup is (probably) being rate-limited right now,
         * not that lyrics genuinely don't exist. Keep quietly retrying
         * in the background -- staying on the loading state -- instead
         * of surfacing "unavailable" for something that might resolve
         * a few seconds later.
         */
        const isRateLimited =
          response.status === 429 || data?.status === "retry";

        if (isRateLimited && retryCount < MAX_RETRIES) {
          const delay = getRetryDelayMs(data?.retryAfterSeconds, retryCount);
          retryCount += 1;
          retryTimeout = setTimeout(loadLyrics, delay);
          return;
        }

        if (!response.ok) {
          throw new Error(data?.message || "Lyrics unavailable");
        }

        const apiLines = Array.isArray(data?.lyrics?.lines)
          ? data.lyrics.lines
          : [];

        const normalizedLines = apiLines
          .map((line) => ({
            startTimeMs: Number(line?.startTimeMs),
            words: String(line?.words || "").trim(),
          }))
          .filter((line) => Number.isFinite(line.startTimeMs) && line.words)
          .sort((a, b) => a.startTimeMs - b.startTimeMs);

        // Only remember definitive answers; a status (retry/unavailable)
        // means "couldn't find out", so let a later attempt try again.
        if (!data?.status) lyricsCache.set(trackId, normalizedLines);

        if (controller.signal.aborted) return;

        setLines(normalizedLines);
        setUnavailable(normalizedLines.length === 0);
        setLoading(false);
      } catch (error) {
        if (error.name === "AbortError") return;

        console.error("LYRICS LOAD ERROR:", error);

        if (!controller.signal.aborted) {
          lyricsCache.delete(trackId);
          setLines([]);
          setUnavailable(true);
          setLoading(false);
        }
      }
    }

    loadLyrics();

    return () => {
      controller.abort();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!lines.length) {
      setActiveLine(-1);
      return;
    }

    const currentTimeMs = Math.max(0, Number(currentTime || 0) * 1000);
    let nextActiveLine = 0;

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].startTimeMs <= currentTimeMs) {
        nextActiveLine = index;
      } else {
        break;
      }
    }

    setActiveLine(nextActiveLine);
  }, [currentTime, lines]);

  return { lines, loading, unavailable, activeLine };
}
