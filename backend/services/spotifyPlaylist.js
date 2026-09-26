import { resolveSpotifyPlaylistWithProviders } from "./musicProviders.js";

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

async function spotifyJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `Spotify API request failed with HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

function normalizeMatchValue(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase();
}

function exactTrackMatch(providerTrack, apiTrack) {
  if (!providerTrack?.name || !apiTrack?.name) return false;
  const providerArtist = normalizeMatchValue(providerTrack.artists?.[0]?.name);
  const apiArtist = normalizeMatchValue(apiTrack.artists?.[0]?.name);
  return (
    normalizeMatchValue(providerTrack.name) === normalizeMatchValue(apiTrack.name) &&
    providerArtist &&
    providerArtist === apiArtist
  );
}

async function resolveProviderTrack(providerTrack, token, market) {
  const providerId = String(providerTrack?.spotifyTrackId || providerTrack?.id || "").trim();

  if (providerId) {
    try {
      const byId = await spotifyJson(
        `https://api.spotify.com/v1/tracks/${encodeURIComponent(providerId)}?market=${encodeURIComponent(market)}`,
        token,
      );
      if (byId?.id && exactTrackMatch(providerTrack, byId)) return byId;
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
  }

  const name = normalizeMatchValue(providerTrack?.name);
  const artist = normalizeMatchValue(providerTrack?.artists?.[0]?.name);
  if (!name || !artist) return null;

  const query = `track:"${providerTrack.name}" artist:"${providerTrack.artists[0].name}"`;
  const search = await spotifyJson(
    `https://api.spotify.com/v1/search?${new URLSearchParams({
      q: query,
      type: "track",
      limit: "10",
      market,
    })}`,
    token,
  );

  const candidates = Array.isArray(search?.tracks?.items)
    ? search.tracks.items
    : [];
  return candidates.find((candidate) => exactTrackMatch(providerTrack, candidate)) || null;
}

async function getOfficialSpotifyPlaylistMetadata(playlistId, token, market) {
  return spotifyJson(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?market=${encodeURIComponent(market)}`,
    token,
  );
}

async function getOfficialSpotifyPlaylist(
  playlistId,
  getSpotifyToken,
  providerTracks = [],
) {
  const token = await getSpotifyToken();
  const market = process.env.SPOTIFY_MARKET || "PH";
  const data = await getOfficialSpotifyPlaylistMetadata(playlistId, token, market);

  const tracks = [];
  const unresolvedTracks = [];
  for (const providerTrack of providerTracks) {
    const resolved = await resolveProviderTrack(providerTrack, token, market);
    if (resolved) tracks.push(resolved);
    else unresolvedTracks.push({
      index: providerTrack.playlistIndex,
      name: providerTrack.name,
      artists: providerTrack.artists || [],
      spotifyTrackId: providerTrack.spotifyTrackId || providerTrack.id || null,
    });
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
    unresolvedTracks,
    providerTrackCount: providerTracks.length,
  };
}

export async function getSpotifyPublicPlaylist(
  playlistId,
  getSpotifyToken,
) {
  const resolved = await resolveSpotifyPlaylistWithProviders(
    playlistId,
    {
      officialApiResolver: (id, providerTracks) =>
        getOfficialSpotifyPlaylist(id, getSpotifyToken, providerTracks),
    },
  );

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
    unresolvedTracks: Array.isArray(resolved.unresolvedTracks) ? resolved.unresolvedTracks : [],
    tracks: Array.isArray(resolved.tracks)
      ? resolved.tracks.map(normalizeTrackForApplication).filter(Boolean)
      : [],
  };
}
