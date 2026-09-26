export function extractSpotifyPlaylistId(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  const match = trimmed.match(
    /^https?:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)(?:[/?#].*)?$/i,
  );

  return match ? match[1] : null;
}

function normalizePlaylistItem(item) {
  // Spotify 2026 API:
  // playlist.items[].item
  //
  // Older API:
  // playlist.tracks.items[].track

  const track = item?.item || item?.track;

  if (!track?.id || !track?.name) {
    return null;
  }

  // Ignore episodes and other non-track items.
  if (track.type && track.type !== "track") {
    return null;
  }

  return {
    ...track,
    artists: Array.isArray(track.artists)
      ? track.artists
      : [],
    album: track.album || {
      images: [],
      name: "",
    },
  };
}

export async function getSpotifyPublicPlaylist(
  playlistId,
  getSpotifyToken,
) {
  if (!/^[A-Za-z0-9]+$/.test(String(playlistId || ""))) {
    const error = new Error(
      "Invalid Spotify playlist ID",
    );

    error.status = 400;

    throw error;
  }

  const token = await getSpotifyToken();

  const market =
    process.env.SPOTIFY_MARKET || "PH";

  /*
   * IMPORTANT:
   *
   * Spotify now uses `items` instead of `tracks`.
   */
  const url =
    `https://api.spotify.com/v1/playlists/` +
    `${encodeURIComponent(playlistId)}` +
    `?market=${encodeURIComponent(market)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.id) {
    const error = new Error(
      data?.error?.message ||
        `Spotify playlist lookup failed with HTTP ${response.status}`,
    );

    error.status = response.status;

    throw error;
  }

  const tracks = [];

  /*
   * Spotify 2026 API:
   *
   * data.items.items
   *
   * The old:
   *
   * data.tracks.items
   *
   * is no longer the correct structure.
   */

  if (Array.isArray(data.items?.items)) {
    tracks.push(
      ...data.items.items
        .map(normalizePlaylistItem)
        .filter(Boolean),
    );
  }

  /*
   * Spotify may give us a next URL for pagination.
   */
  let nextUrl = data.items?.next || null;

  while (nextUrl) {
    const itemsResponse = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const itemsData =
      await itemsResponse.json().catch(() => null);

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
          .map(normalizePlaylistItem)
          .filter(Boolean),
      );
    }

    nextUrl = itemsData?.next || null;
  }

  /*
   * Spotify 2026:
   *
   * data.items.total
   *
   * Older:
   *
   * data.tracks.total
   */
  const trackCount =
    Number(data.items?.total) ||
    Number(data.tracks?.total) ||
    tracks.length;

  return {
    id: `spotify:${data.id}`,

    type: "spotify-public",

    spotifyPlaylistId: data.id,

    name:
      data.name ||
      "Spotify Playlist",

    owner:
      data.owner?.display_name ||
      data.owner?.id ||
      "Spotify",

    description:
      data.description || "",

    cover:
      data.images?.[0]?.url || "",

    externalUrl:
      data.external_urls?.spotify || "",

    trackCount,

    tracks,
  };
}