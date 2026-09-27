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

export async function resolveSpotifyPlaylistWithProviders(
  playlistId,
  { officialApiResolver, skipCache = false } = {},
) {
  const id = String(playlistId || "").trim();

  const provider = spotifyWebProvider;
  const cacheKey = getCacheKey(provider.id, id);
  const cached = skipCache ? null : getCached(cacheKey);

  if (cached) {
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

    return setCached(
      cacheKey,
      result,
      isTransientResult(result) ? TRANSIENT_CACHE_TTL_MS : PROVIDER_CACHE_TTL_MS,
    );
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

      return setCached(
        cacheKey,
        result,
        isTransientResult(result) ? TRANSIENT_CACHE_TTL_MS : PROVIDER_CACHE_TTL_MS,
      );
    } catch (officialError) {
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

  throw webError || new Error("No Spotify playlist provider succeeded");
}