import { getSpotifyToken } from "./spotify.js";
import { resolveTrackViaEmbed } from "../providers/spotifyWeb.js";

export function createLyricsCache() {
  return new Map();
}

export function parseLrcLyrics(syncedLyrics) {
  if (typeof syncedLyrics !== "string" || !syncedLyrics.trim()) return [];
  const lines = [];
  for (const rawLine of syncedLyrics.split(/\r?\n/)) {
    const timestampPattern = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    const timestamps = [];
    let match;
    while ((match = timestampPattern.exec(rawLine)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] || "";
      if (seconds >= 60) continue;
      const milliseconds = fraction.length === 0 ? 0 : Number(fraction.padEnd(3, "0").slice(0, 3));
      const startTimeMs = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
      if (Number.isFinite(startTimeMs)) timestamps.push(startTimeMs);
    }
    if (!timestamps.length) continue;
    const words = rawLine.replace(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g, "").trim();
    if (!words) continue;
    for (const startTimeMs of timestamps) lines.push({ startTimeMs, words });
  }
  return lines.sort((a, b) => a.startTimeMs - b.startTimeMs);
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