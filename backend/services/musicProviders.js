import { createSpotifyWebProvider } from "../providers/spotifyWeb.js";

const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;
const playlistCache = new Map();

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

  if (Date.now() - cached.createdAt > PROVIDER_CACHE_TTL_MS) {
    playlistCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCached(key, value) {
  playlistCache.set(key, {
    createdAt: Date.now(),
    value,
  });

  return value;
}

export async function resolveSpotifyPlaylistWithProviders(
  playlistId,
  { officialApiResolver } = {},
) {
  const id = String(playlistId || "").trim();

  const provider = spotifyWebProvider;
  const cacheKey = getCacheKey(provider.id, id);
  const cached = getCached(cacheKey);

  if (cached) {
    return {
      ...cached,
      fromCache: true,
    };
  }

  let webError = null;

  let resolved;
  try {
    resolved = await provider.resolvePlaylist(id);
  } catch (error) {
    webError = error;
  }

  if (resolved && typeof officialApiResolver === "function") {
    try {
      const official = await officialApiResolver(id, resolved.tracks);
      const resolvedCount = official.tracks.length;
      const expectedCount = resolved.tracks.length;
      const tracksStatus =
        expectedCount === 0
          ? (official.trackCount === 0 ? "empty" : "unavailable")
          : resolvedCount > 0
            ? "available"
            : "unavailable";

      return setCached(cacheKey, {
        ...resolved,
        ...official,
        source: "spotify-web+spotify-api",
        tracksStatus,
        tracksAvailable: resolvedCount > 0,
        tracksReason:
          tracksStatus === "available"
            ? null
            : tracksStatus === "empty"
              ? "playlist-empty"
              : "spotify-api-exact-match-unavailable",
        providerTrackCount: expectedCount,
        unresolvedTracks: official.unresolvedTracks || [],
      });
    } catch (officialError) {
      return setCached(cacheKey, {
        ...resolved,
        tracks: [],
        source: "spotify-web",
        tracksStatus: "unavailable",
        tracksAvailable: false,
        tracksReason: "spotify-api-resolution-failed",
        providerError: officialError?.message || "Spotify API resolution failed",
      });
    }
  }

  if (resolved) {
    return setCached(cacheKey, {
      ...resolved,
      tracks: [],
      tracksStatus: "unavailable",
      tracksAvailable: false,
      tracksReason: "spotify-api-resolver-unavailable",
    });
  }

  /*
   * The public embed provider is primary. If it fails, use the existing
   * official Web API only as a metadata fallback. We deliberately do not
   * turn the official API's restricted playlist response into an empty
   * playlist.
   */
  if (typeof officialApiResolver === "function") {
    try {
      const official = await officialApiResolver(id, []);

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

      return setCached(cacheKey, result);
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
