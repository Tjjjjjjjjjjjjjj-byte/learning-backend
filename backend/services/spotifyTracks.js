import {
  resolveTrackViaEmbed,
  mapWithConcurrency,
} from "../providers/spotifyWeb.js";
import {
  guardedFetch,
  embedFetch,
  getSpotifyToken,
  invalidateSpotifyToken,
  singleFlight,
  isOfficialTracksDisabled,
  disableOfficialTracks,
  SpotifyRateLimitError,
} from "./spotifyHttp.js";

/*
 * Single source of truth for "give me Spotify track metadata for these
 * IDs". Shared by the public-playlist enrichment, the private playlist
 * route and the lyrics lookup, so a track resolved by ANY of them is
 * never fetched from Spotify again for 24h.
 */

const TRACK_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 1000; // non-429 failures (404, blank page...)
const MAX_CACHE_ENTRIES = 5000;

const trackCache = new Map(); // id -> { data, createdAt }
const negativeCache = new Map(); // id -> expiresAt

export function getCachedTrack(id) {
  const hit = trackCache.get(id);
  if (!hit) return null;

  if (Date.now() - hit.createdAt > TRACK_TTL_MS) {
    trackCache.delete(id);
    return null;
  }

  return hit.data;
}

function setCachedTrack(id, data) {
  if (trackCache.size >= MAX_CACHE_ENTRIES) {
    // Map keeps insertion order -> evict the oldest entry.
    trackCache.delete(trackCache.keys().next().value);
  }

  trackCache.set(id, { data, createdAt: Date.now() });
  return data;
}

function isNegativelyCached(id) {
  const until = negativeCache.get(id);
  if (!until) return false;

  if (Date.now() > until) {
    negativeCache.delete(id);
    return false;
  }

  return true;
}

// A blank embed result almost always means "we got a challenge/empty page",
// not "this track has no metadata" -- don't cache it as a success.
function isUsableTrack(track) {
  return Boolean(track?.id && track?.name);
}

/*
 * Single track via the embed page. Cached, de-duplicated, rate-limit aware.
 * Returns null when the track genuinely can't be resolved (404 / blank);
 * THROWS SpotifyRateLimitError when we're rate limited so callers can
 * tell "retry later" apart from "doesn't exist".
 */
export function resolveTrackCached(id) {
  const cached = getCachedTrack(id);
  if (cached) return Promise.resolve(cached);

  if (isNegativelyCached(id)) return Promise.resolve(null);

  return singleFlight(`track:${id}`, async () => {
    try {
      const track = await resolveTrackViaEmbed(id, embedFetch);

      if (!isUsableTrack(track)) {
        negativeCache.set(id, Date.now() + NEGATIVE_TTL_MS);
        return null;
      }

      return setCachedTrack(id, track);
    } catch (error) {
      if (error instanceof SpotifyRateLimitError) throw error;

      negativeCache.set(id, Date.now() + NEGATIVE_TTL_MS);
      console.error(`[spotify-tracks] embed lookup failed for ${id}:`, error.message);
      return null;
    }
  });
}

/*
 * Official batched endpoint (50 ids/request). Skipped entirely while we
 * know it 403s for this app.
 */
async function fetchOfficialBatch(ids, market, out) {
  if (ids.length === 0 || isOfficialTracksDisabled()) return;

  let token;
  try {
    token = await getSpotifyToken();
  } catch (error) {
    if (error instanceof SpotifyRateLimitError) throw error;
    console.error("[spotify-tracks] token fetch failed:", error.message);
    return;
  }

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url =
      `https://api.spotify.com/v1/tracks?ids=${batch.join(",")}` +
      `&market=${encodeURIComponent(market)}`;

    const response = await guardedFetch("api", url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      invalidateSpotifyToken();
      return;
    }

    if (response.status === 403) {
      disableOfficialTracks();
      return;
    }

    if (!response.ok) {
      console.error(`[spotify-tracks] GET /v1/tracks failed: HTTP ${response.status}`);
      continue;
    }

    const data = await response.json().catch(() => null);

    for (const track of data?.tracks || []) {
      if (isUsableTrack(track)) {
        out.set(track.id, setCachedTrack(track.id, track));
      }
    }
  }
}

/*
 * Resolve many track ids.
 *
 * Returns:
 *   tracks            Map<id, track> for everything we could resolve
 *   missingIds        ids we could NOT resolve
 *   rateLimited       true if any miss was caused by a 429 (=> retry later,
 *                     and a retry will be cheap: resolved ids are cached)
 *   retryAfterSeconds hint for the client
 */
export async function getTracksByIds(
  trackIds,
  { market = process.env.SPOTIFY_MARKET || "PH", embedConcurrency = 3 } = {},
) {
  const ids = [...new Set(trackIds.filter((id) => /^[A-Za-z0-9]{22}$/.test(id)))];
  const tracks = new Map();

  for (const id of ids) {
    const cached = getCachedTrack(id);
    if (cached) tracks.set(id, cached);
  }

  let rateLimited = false;
  let retryAfterSeconds = 0;

  const noteRateLimit = (error) => {
    rateLimited = true;
    retryAfterSeconds = Math.max(retryAfterSeconds, error.retryAfterSeconds || 0);
  };

  let pending = ids.filter((id) => !tracks.has(id));

  if (pending.length > 0) {
    try {
      await fetchOfficialBatch(pending, market, tracks);
    } catch (error) {
      // A 429 on the official API is not fatal: the embed fallback lives on
      // a different host and has its own budget.
      if (!(error instanceof SpotifyRateLimitError)) throw error;
    }

    pending = pending.filter((id) => !tracks.has(id) && !isNegativelyCached(id));
  }

  if (pending.length > 0) {
    await mapWithConcurrency(pending, embedConcurrency, async (id) => {
      try {
        const track = await resolveTrackCached(id);
        if (track) tracks.set(id, track);
      } catch (error) {
        if (error instanceof SpotifyRateLimitError) noteRateLimit(error);
        else console.error(`[spotify-tracks] ${id}:`, error.message);
      }
    });
  }

  return {
    tracks,
    missingIds: ids.filter((id) => !tracks.has(id)),
    rateLimited,
    retryAfterSeconds,
  };
}
