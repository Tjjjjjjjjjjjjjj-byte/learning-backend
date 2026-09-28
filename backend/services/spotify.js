import {
  guardedFetch,
  getSpotifyToken,
  invalidateSpotifyToken,
  isOfficialTracksDisabled,
  disableOfficialTracks,
  SpotifyRateLimitError,
} from "./spotifyHttp.js";
import { resolveTrackCached, getCachedTrack } from "./spotifyTracks.js";

// Re-exported so existing imports (server.js etc.) keep working. The token
// is now cached for its lifetime instead of being re-requested every call.
export { getSpotifyToken };

/*
 * Track metadata for the lyrics route. Order: shared cache -> official API
 * (skipped while it's known to 403) -> embed scrape. Throws
 * SpotifyRateLimitError (status 429 + retryAfterSeconds) when limited so the
 * route can tell the client exactly how long to wait.
 */
export async function getSpotifyTrackForLyrics(trackId) {
  const cached = getCachedTrack(trackId);
  if (cached) return cached;

  if (!isOfficialTracksDisabled()) {
    try {
      const token = await getSpotifyToken();
      const response = await guardedFetch(
        "api",
        `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.status === 401) invalidateSpotifyToken();
      if (response.status === 403) disableOfficialTracks();

      const data = await response.json().catch(() => null);

      if (response.ok && data?.id) return data;
      if (response.status === 404) return null;
    } catch (error) {
      // Rate limit on the official API: the embed page is a different host,
      // so still try it below.
      if (!(error instanceof SpotifyRateLimitError)) {
        console.warn(`[lyrics] official lookup threw for ${trackId}:`, error.message);
      }
    }
  }

  return resolveTrackCached(trackId);
}
