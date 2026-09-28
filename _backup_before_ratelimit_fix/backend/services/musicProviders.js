import { createSpotifyWebProvider } from "../providers/spotifyWeb.js";

const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;

/*
 * A "no tracks" result caused by Spotify rate-limiting/blocking us is
 * transient -- it can clear up within seconds. Caching it for the full
 * 5 minutes would lock the playlist at "0 songs" for the whole window
 * even once Spotify would let a fresh request through again, so these
 * degraded results get a much shorter TTL than a real, full result.
 */
const TRANSIENT_CACHE_TTL_MS = 15 * 1000;
const playlistCache = new Map();

/*
 * Separate from the short-lived cache above: the last result we ACTUALLY
 * got real tracks for, per playlist. This never expires on its own (only
 * gets overwritten by a newer good result). If a fresh attempt comes back
 * degraded (rate-limited, 0 tracks) but we already know this playlist has
 * tracks, we serve the last-good data instead of flashing "0 songs" for a
 * playlist that was working moments ago.
 */
const lastGoodPlaylistCache = new Map();

function isTransientResult(result) {
  return !result.tracksAvailable && result.tracksReason !== "playlist-empty";
}

const spotifyWebProvider = createSpotifyWebProvider();

export function getMetadataProviders() {
  return [spotifyWebProvider];
}

function getCacheKey(providerId, playlistId) {
  return `${providerId}:${playlistId}`;
}

function getCached(key) {
  const cached = playlistCache.get(key);

  if (!cached) return null;

  if (Date.now() - cached.createdAt > cached.ttl) {
    playlistCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCached(key, value, ttl = PROVIDER_CACHE_TTL_MS) {
  playlistCache.set(key, {
    createdAt: Date.now(),
    ttl,
    value,
  });

  return value;
}

function getLastGood(key) {
  return lastGoodPlaylistCache.get(key) || null;
}

function setLastGood(key, value) {
  lastGoodPlaylistCache.set(key, value);
  return value;
}

/*
 * Central place every code path below routes a freshly-computed result
 * through: a real result updates (and is returned from) the last-good
 * cache; a degraded/transient result instead falls back to whatever
 * last-good data we already have for this playlist, if any.
 */
function resultOrLastGood(cacheKey, result) {
  if (!isTransientResult(result)) {
    return setLastGood(cacheKey, result);
  }

  const lastGood = getLastGood(cacheKey);

  return lastGood ? { ...lastGood, fromCache: true, stale: true } : result;
}

export async function resolveSpotifyPlaylistWithProviders(
  playlistId,
  { officialApiResolver, skipCache = false } = {},
) {
  const id = String(playlistId || "").trim();

  const provider = spotifyWebProvider;
  const cacheKey = getCacheKey(provider.id, id);
  const cached = skipCache ? null : getCached(cacheKey);

  if (cached) {
    if (isTransientResult(cached)) {
      const lastGood = getLastGood(cacheKey);
      if (lastGood) return { ...lastGood, fromCache: true, stale: true };
    }

    return {
      ...cached,
      fromCache: true,
    };
  }

  let webError = null;

  try {
    const resolved = await provider.resolvePlaylist(id);

    const result = {
      ...resolved,
      tracksStatus:
        resolved.tracks.length > 0
          ? "available"
          : resolved.trackCount === 0
            ? "empty"
            : "unavailable",
      tracksAvailable: resolved.tracks.length > 0,
      tracksReason:
        resolved.tracks.length > 0
          ? null
          : resolved.trackCount === 0
            ? "playlist-empty"
            : "provider-returned-no-items",
    };

    setCached(
      cacheKey,
      result,
      isTransientResult(result) ? TRANSIENT_CACHE_TTL_MS : PROVIDER_CACHE_TTL_MS,
    );

    return resultOrLastGood(cacheKey, result);
  } catch (error) {
    webError = error;
  }

  /*
   * The public embed provider is primary. If it fails, use the existing
   * official Web API only as a metadata fallback. We deliberately do not
   * turn the official API's restricted playlist response into an empty
   * playlist.
   */
  if (typeof officialApiResolver === "function") {
    try {
      const official = await officialApiResolver(id);

      const result = {
        ...official,
        source: "spotify-api-fallback",
        tracksStatus:
          official.tracks?.length > 0
            ? "available"
            : official.trackCount === 0
              ? "empty"
              : "metadata-only",
        tracksAvailable: official.tracks?.length > 0,
        tracksReason:
          official.tracks?.length > 0
            ? null
            : official.trackCount === 0
              ? "playlist-empty"
              : "spotify-api-items-unavailable",
        providerError: webError?.message || null,
      };

      setCached(
        cacheKey,
        result,
        isTransientResult(result) ? TRANSIENT_CACHE_TTL_MS : PROVIDER_CACHE_TTL_MS,
      );

      return resultOrLastGood(cacheKey, result);
    } catch (officialError) {
      const lastGood = getLastGood(cacheKey);
      if (lastGood) return { ...lastGood, fromCache: true, stale: true };

      const error = new Error(
        `Spotify playlist providers failed: ${
          webError?.message || "web provider failed"
        }; ${
          officialError?.message || "official API fallback failed"
        }`,
      );

      error.status =
        Number.isInteger(officialError?.status) &&
        officialError.status >= 400 &&
        officialError.status <= 599
          ? officialError.status
          : Number.isInteger(webError?.status)
            ? webError.status
            : 502;

      throw error;
    }
  }

  const lastGood = getLastGood(cacheKey);
  if (lastGood) return { ...lastGood, fromCache: true, stale: true };

  throw webError || new Error("No Spotify playlist provider succeeded");
}