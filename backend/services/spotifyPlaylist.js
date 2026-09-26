export function extractSpotifyPlaylistId(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  const match = trimmed.match(
    /^https?:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)(?:[/?#].*)?$/i,
  );

  return match ? match[1] : null;
}

function normalizePlaylistTrack(item) {
  const track = item?.track;

  if (!track?.id || !track?.name) {
    return null;
  }

  return {
    ...track,
    artists: Array.isArray(track.artists) ? track.artists : [],
    album: track.album || { images: [], name: "" },
  };
}

export async function getSpotifyPublicPlaylist(playlistId, getSpotifyToken) {
  if (!/^[A-Za-z0-9]+$/.test(String(playlistId || ""))) {
    throw new Error("Invalid Spotify playlist ID");
  }

  const token = await getSpotifyToken();

  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.id) {
    const error = new Error(
      data?.error?.message || `Spotify playlist lookup failed with HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  const tracks = [];
  let nextUrl = data.tracks?.href || null;

  // Use the playlist response's first page, then follow Spotify pagination.
  if (Array.isArray(data.tracks?.items)) {
    tracks.push(...data.tracks.items.map(normalizePlaylistTrack).filter(Boolean));
  }

  while (nextUrl) {
    const tracksResponse = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const tracksData = await tracksResponse.json().catch(() => null);

    if (!tracksResponse.ok) {
      const error = new Error(
        tracksData?.error?.message ||
          `Spotify playlist tracks lookup failed with HTTP ${tracksResponse.status}`,
      );
      error.status = tracksResponse.status;
      throw error;
    }

    if (Array.isArray(tracksData?.items)) {
      tracks.push(
        ...tracksData.items.map(normalizePlaylistTrack).filter(Boolean),
      );
    }

    nextUrl = tracksData?.next || null;
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
    trackCount: Number(data.tracks?.total) || tracks.length,
    tracks,
  };
}
