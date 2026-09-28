import { resolveSpotifyPlaylistWithProviders } from "./musicProviders.js";
import { guardedFetch } from "./spotifyHttp.js";
import { getTracksByIds } from "./spotifyTracks.js";

export function extractSpotifyPlaylistId(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  const urlMatch = trimmed.match(
    /^https?:\/\/open\.spotify\.com\/(?:embed\/)?playlist\/([A-Za-z0-9]+)(?:[/?#].*)?$/i,
  );

  if (urlMatch) return urlMatch[1];

  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/i);

  if (uriMatch) return uriMatch[1];

  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;

  return null;
}

function normalizeTrackForApplication(track) {
  if (!track?.id || !track?.name) return null;

  return {
    ...track,
    artists: Array.isArray(track.artists) ? track.artists : [],
    album: track.album || { images: [], name: "" },
    duration_ms: Number(track.duration_ms) || 0,
  };
}

async function getOfficialSpotifyPlaylist(
  playlistId,
  getSpotifyToken,
) {
  const token = await getSpotifyToken();
  const market = process.env.SPOTIFY_MARKET || "PH";
  const url =
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}` +
    `?market=${encodeURIComponent(market)}`;

  const response = await guardedFetch("api", url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok || !data?.id) {
    const error = new Error(
      data?.error?.message ||
        `Spotify playlist lookup failed with HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  const tracks = [];

  if (Array.isArray(data.items?.items)) {
    tracks.push(
      ...data.items.items
        .map((item) => item?.item || item?.track)
        .map(normalizeTrackForApplication)
        .filter(Boolean),
    );
  }

  let nextUrl = data.items?.next || null;

  while (nextUrl) {
    const itemsResponse = await guardedFetch("api", nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const itemsText = await itemsResponse.text();

    let itemsData = null;

    try {
      itemsData = itemsText ? JSON.parse(itemsText) : null;
    } catch {
      itemsData = null;
    }

    if (!itemsResponse.ok) {
      const error = new Error(
        itemsData?.error?.message ||
          `Spotify playlist items lookup failed with HTTP ${itemsResponse.status}`,
      );
      error.status = itemsResponse.status;
      throw error;
    }

    if (Array.isArray(itemsData?.items)) {
      tracks.push(
        ...itemsData.items
          .map((item) => item?.item || item?.track)
          .map(normalizeTrackForApplication)
          .filter(Boolean),
      );
    }

    nextUrl = itemsData?.next || null;
  }

  const trackCount = Number.isFinite(Number(data.items?.total))
    ? Number(data.items.total)
    : Number.isFinite(Number(data.tracks?.total))
      ? Number(data.tracks.total)
      : null;

  return {
    id: `spotify:${data.id}`,
    type: "spotify-public",
    spotifyPlaylistId: data.id,
    name: data.name || "Spotify Playlist",
    owner: data.owner?.display_name || data.owner?.id || "Spotify",
    description: data.description || "",
    cover: data.images?.[0]?.url || "",
    externalUrl: data.external_urls?.spotify || "",
    public: data.public ?? null,
    collaborative: Boolean(data.collaborative),
    snapshotId: data.snapshot_id || null,
    trackCount,
    tracks,
  };
}

/*
 * The playlist embed page only has a playlist-level cover, so per-track
 * artwork comes from a per-track lookup -- done through the shared,
 * cached, rate-limit-aware resolver (spotifyTracks.js).
 * `complete` is false when a 429 stopped us early; the caller must then
 * NOT cache the result as final, so the next request fills in the rest
 * (everything already resolved is served from the 24h track cache).
 */
async function enrichTracksWithOfficialArtwork(tracks) {
  const ids = tracks
    .map((track) => track.spotifyTrackId)
    .filter((id) => typeof id === "string" && /^[A-Za-z0-9]{22}$/.test(id));

  if (ids.length === 0) return { tracks, complete: true };

  const { tracks: byId, missingIds, rateLimited } = await getTracksByIds(ids);

  console.log(
    `[spotify-playlist] enriched ${byId.size}/${new Set(ids).size} tracks` +
      (rateLimited ? " (rate limited, will finish on next request)" : ""),
  );

  return {
    tracks: applyOfficialTracks(tracks, byId),
    complete: !rateLimited || missingIds.length === 0,
  };
}

function applyOfficialTracks(tracks, officialTracksById) {
  if (officialTracksById.size === 0) return tracks;

  return tracks.map((track) => {
    const official = track.spotifyTrackId
      ? officialTracksById.get(track.spotifyTrackId)
      : null;

    if (!official?.album?.images?.length) return track;

    return {
      ...track,
      artwork: official.album.images[0].url,
      album: {
        ...track.album,
        name: official.album.name || track.album?.name,
        images: official.album.images,
      },
    };
  });
}

const ENRICHED_TRACKS_CACHE_TTL_MS = 5 * 60 * 1000;
const enrichedTracksCache = new Map();

function getCachedEnrichedTracks(key) {
  const cached = enrichedTracksCache.get(key);

  if (!cached) return null;

  if (Date.now() - cached.createdAt > ENRICHED_TRACKS_CACHE_TTL_MS) {
    enrichedTracksCache.delete(key);
    return null;
  }

  return cached.tracks;
}

function setCachedEnrichedTracks(key, tracks) {
  enrichedTracksCache.set(key, { createdAt: Date.now(), tracks });
  return tracks;
}

export async function getSpotifyPublicPlaylist(
  playlistId,
  getSpotifyToken,
  options = {},
) {
  const resolved = await resolveSpotifyPlaylistWithProviders(
    playlistId,
    {
      skipCache: Boolean(options.skipCache),
      officialApiResolver: (id) =>
        getOfficialSpotifyPlaylist(id, getSpotifyToken),
    },
  );

  console.log(
    `[spotify-playlist] provider=${resolved.source || "spotify-web"} cover="${resolved.cover || ""}"`,
  );

  let tracks = Array.isArray(resolved.tracks)
    ? resolved.tracks.map(normalizeTrackForApplication).filter(Boolean)
    : [];

  if (
    !options.skipTrackEnrichment &&
    (resolved.source || "spotify-web") === "spotify-web" &&
    tracks.length > 0
  ) {
    const enrichmentCacheKey = resolved.playlistId || resolved.spotifyPlaylistId;
    const cachedTracks = options.skipCache
      ? null
      : getCachedEnrichedTracks(enrichmentCacheKey);

    if (cachedTracks) {
      tracks = cachedTracks;
    } else {
      try {
        const enriched = await enrichTracksWithOfficialArtwork(tracks);
        tracks = enriched.tracks;
        if (enriched.complete) setCachedEnrichedTracks(enrichmentCacheKey, tracks);
      } catch (error) {
        console.error("SPOTIFY TRACK ARTWORK ENRICHMENT ERROR:", error);
      }
    }
  }

  return {
    id: `spotify:${resolved.playlistId || resolved.spotifyPlaylistId}`,
    type: "spotify-public",
    spotifyPlaylistId: resolved.playlistId || resolved.spotifyPlaylistId,
    name: resolved.name || "Spotify Playlist",
    owner: resolved.owner || "Spotify",
    description: resolved.description || "",
    cover: resolved.cover || "",
    externalUrl:
      resolved.externalUrl ||
      `https://open.spotify.com/playlist/${resolved.playlistId || resolved.spotifyPlaylistId}`,
    public: resolved.public ?? true,
    collaborative: Boolean(resolved.collaborative),
    snapshotId: resolved.snapshotId || null,
    trackCount:
      Array.isArray(resolved.tracks) &&
      resolved.tracks.length > 0 &&
      Number(resolved.trackCount) === 0
        ? resolved.tracks.length
        : Number.isFinite(Number(resolved.trackCount))
          ? Number(resolved.trackCount)
          : Array.isArray(resolved.tracks)
            ? resolved.tracks.length
            : null,
    itemsStatus: resolved.tracksStatus || "unavailable",
    itemsMessage:
      resolved.tracksReason === "spotify-api-items-unavailable"
        ? "Spotify's official API did not expose this playlist's items to the current API client."
        : resolved.tracksReason === "provider-returned-no-items"
          ? "Spotify's public web playlist provider did not expose any track items."
          : resolved.tracksStatus === "empty"
            ? "This playlist contains no available songs."
            : null,
    tracksAvailable: Boolean(resolved.tracksAvailable),
    tracksReason: resolved.tracksReason || null,
    provider: resolved.source || "spotify-web",
    tracks,
  };
}