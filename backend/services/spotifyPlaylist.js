import { resolveSpotifyPlaylistWithProviders } from "./musicProviders.js";
import {
  resolveTrackViaEmbed,
  mapWithConcurrency,
} from "../providers/spotifyWeb.js";

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

  const response = await fetch(url, {
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
    const itemsResponse = await fetch(nextUrl, {
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
 * The playlist embed-page scraper never has per-track artwork available at
 * all -- only a single playlist-level cover comes back from that page.
 * Every track therefore falls back to the playlist cover unless we look
 * each one up individually. We try Spotify's official batched "Get Several
 * Tracks" endpoint first (cheap: up to 50 tracks per request), but this
 * app's credentials currently get a flat 403 from that endpoint regardless
 * of batching -- Spotify restricting official Web API access for apps
 * without Extended Quota approval, not something fixable here. Whatever
 * doesn't come back from the official endpoint falls back to scraping each
 * track's own embed page individually (resolveTrackViaEmbed), which isn't
 * gated behind that same restriction.
 */
async function enrichTracksWithOfficialArtwork(tracks, getSpotifyToken) {
  const ids = [
    ...new Set(
      tracks
        .map((track) => track.spotifyTrackId)
        .filter((id) => typeof id === "string" && /^[A-Za-z0-9]{22}$/.test(id)),
    ),
  ];

  console.log(
    `[spotify-playlist] ${ids.length} of ${tracks.length} tracks had a usable Spotify track ID`,
  );

  if (ids.length === 0) return tracks;

  let token;
  try {
    token = await getSpotifyToken();
  } catch (error) {
    console.error("[spotify-playlist] getSpotifyToken() failed:", error);
    return tracks;
  }

  const market = process.env.SPOTIFY_MARKET || "PH";
  const officialTracksById = new Map();

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url =
      `https://api.spotify.com/v1/tracks?ids=${batch.join(",")}` +
      `&market=${encodeURIComponent(market)}`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        console.error(
          `[spotify-playlist] GET /v1/tracks batch failed: HTTP ${response.status}`,
        );
        continue;
      }

      const data = await response.json();

      for (const officialTrack of data?.tracks || []) {
        if (officialTrack?.id) {
          officialTracksById.set(officialTrack.id, officialTrack);
        }
      }
    } catch (error) {
      // Best-effort enrichment -- keep whatever artwork we already have
      // for this batch and move on.
      console.error("[spotify-playlist] GET /v1/tracks batch threw:", error);
    }
  }

  console.log(
    `[spotify-playlist] fetched official data for ${officialTracksById.size} of ${ids.length} track IDs`,
  );

  // Spotify's official API can be (and currently is, for this app) walled
  // off with a flat 403 regardless of batching. Fall back to scraping each
  // remaining track's embed page individually -- slower, but not gated
  // behind the same app-level restriction, since it's the same technique
  // that already works for the playlist itself.
  const missingIds = ids.filter((id) => !officialTracksById.has(id));

  if (missingIds.length > 0) {
    console.log(
      `[spotify-playlist] falling back to embed scrape for ${missingIds.length} track(s)`,
    );

    const scraped = await mapWithConcurrency(missingIds, 6, async (id) => {
      try {
        return await resolveTrackViaEmbed(id);
      } catch (error) {
        console.error(`[spotify-playlist] embed scrape failed for ${id}:`, error.message);
        return null;
      }
    });

    let scrapedCount = 0;

    for (const track of scraped) {
      if (track?.id) {
        officialTracksById.set(track.id, track);
        scrapedCount += 1;
      }
    }

    console.log(
      `[spotify-playlist] embed scrape recovered ${scrapedCount} of ${missingIds.length} track(s)`,
    );
  }

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

export async function getSpotifyPublicPlaylist(
  playlistId,
  getSpotifyToken,
  options = {},
) {
  const resolved = await resolveSpotifyPlaylistWithProviders(
    playlistId,
    {
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

  if ((resolved.source || "spotify-web") === "spotify-web" && tracks.length > 0) {
    try {
      tracks = await enrichTracksWithOfficialArtwork(tracks, getSpotifyToken);
    } catch (error) {
      console.error("SPOTIFY TRACK ARTWORK ENRICHMENT ERROR:", error);
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
      Number.isFinite(Number(resolved.trackCount))
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