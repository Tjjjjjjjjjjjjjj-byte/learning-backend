export function extractSpotifyPlaylistId(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  const match = trimmed.match(
    /^https?:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)(?:[/?#].*)?$/i,
  );

  return match ? match[1] : null;
}

function normalizePlaylistItem(item) {
  const track = item?.item || item?.track;

  if (!track?.id || !track?.name) {
    return null;
  }

  if (track.type && track.type !== "track") {
    return null;
  }

  return {
    ...track,
    artists: Array.isArray(track.artists) ? track.artists : [],
    album: track.album || { images: [], name: "" },
  };
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function getSpotifyPublicPlaylist(playlistId, getSpotifyToken) {
  if (!/^[A-Za-z0-9]+$/.test(String(playlistId || ""))) {
    const error = new Error("Invalid Spotify playlist ID");
    error.status = 400;
    throw error;
  }

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

  const data = await readJsonResponse(response);

  if (!response.ok || !data?.id) {
    const error = new Error(
      data?.error?.message ||
        `Spotify playlist lookup failed with HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  const tracks = [];
  const hasItemsObject = data.items && typeof data.items === "object";

  if (Array.isArray(data.items?.items)) {
    tracks.push(
      ...data.items.items.map(normalizePlaylistItem).filter(Boolean),
    );
  }

  let nextUrl = data.items?.next || null;

  while (nextUrl) {
    const itemsResponse = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const itemsData = await readJsonResponse(itemsResponse);

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
        ...itemsData.items.map(normalizePlaylistItem).filter(Boolean),
      );
    }

    nextUrl = itemsData?.next || null;
  }

  const trackCount = Number.isFinite(Number(data.items?.total))
    ? Number(data.items.total)
    : Number.isFinite(Number(data.tracks?.total))
      ? Number(data.tracks.total)
      : null;

  let itemsStatus = "unavailable";

  if (hasItemsObject) {
    itemsStatus = trackCount === 0 ? "empty" : "available";
  }

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
    itemsStatus,
    itemsMessage:
      itemsStatus === "unavailable"
        ? "Spotify does not expose this playlist's items to the current API client because the playlist is not owned by or collaborative with the current Spotify user."
        : null,
    tracks,
  };
}
