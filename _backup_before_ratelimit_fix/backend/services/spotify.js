import { resolveTrackViaEmbed } from "../providers/spotifyWeb.js";

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
  try {
    const token = await getSpotifyToken();
    const response = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => null);

    if (response.ok && data?.id) return data;

    if (response.status === 404) return null;

    console.warn(
      `[lyrics] official /v1/tracks lookup failed for ${trackId} (HTTP ${response.status}); falling back to embed scrape`,
    );
  } catch (error) {
    console.warn(
      `[lyrics] official /v1/tracks lookup threw for ${trackId}; falling back to embed scrape:`,
      error.message,
    );
  }

  // Same 403-from-Spotify's-official-API situation as the playlist track
  // enrichment: fall back to scraping the track's own embed page, which
  // isn't gated behind that restriction.
  try {
    return await resolveTrackViaEmbed(trackId);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}