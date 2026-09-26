export async function getSpotifyToken() {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || "failed to fetch token");
  }

  const data = await response.json();
  return data.access_token;
}

export async function getSpotifyTrackForLyrics(trackId) {
  const token = await getSpotifyToken();
  const response = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.id) {
    if (response.status === 404) return null;
    throw new Error(data?.error?.message || `Spotify track lookup failed with HTTP ${response.status}`);
  }
  return data;
}
