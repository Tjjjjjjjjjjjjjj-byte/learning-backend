import { getSpotifyToken } from "./spotify.js";

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
