/*
 * Profile page API layer.
 *
 * Every network call the profile page makes lives here, so the components
 * never touch fetch() directly.
 *
 * LISTENING STATS are mocked for now. To connect the backend later:
 *   1. build GET /profile/stats?range=week|month|year|all  (shape below)
 *   2. set USE_MOCK_STATS to false
 * Nothing else needs to change.
 *
 * Expected response of GET /profile/stats?range=<range>:
 * {
 *   range: "week" | "month" | "year" | "all",
 *   totals: {
 *     minutesListened: number,
 *     tracksPlayed:    number,
 *     uniqueArtists:   number,
 *     streakDays:      number
 *   },
 *   activity:   [{ label: string, minutes: number }],
 *   topArtists: [{ name: string, plays: number, minutes: number, image?: string }],
 *   topTracks:  [{ id: string, title: string, artist: string, plays: number, artwork?: string }]
 * }
 *
 * (Most of this can be derived from the `history` array that
 * GET /playback/history already returns: trackId, title, artist,
 * playedAt, duration, completed.)
 */

export const API_BASE = "http://localhost:3000";
export const USE_MOCK_STATS = true;

export const STAT_RANGES = [
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "Last 30 days" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // non-JSON body; fall through to the status check
  }

  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return data;
}

/* ---------- account ---------- */

export async function getCurrentUser() {
  const data = await request("/me");
  return data.user || null;
}

export function logout() {
  return request("/logout", { method: "POST" });
}

/** Clears server caches (playback URLs, lyrics) and browser-side caches. */
export async function clearCache() {
  const data = await request("/account/clear-cache", { method: "POST" });

  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // browser cache clearing is best effort
  }

  return data;
}

export function deleteAccount(password) {
  return request("/account", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

/* ---------- listening stats ---------- */

export async function getListeningStats(range = "week") {
  if (USE_MOCK_STATS) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return buildMockStats(range);
  }

  return request(`/profile/stats?range=${encodeURIComponent(range)}`);
}

/* ---------- mock data (delete with USE_MOCK_STATS) ---------- */

function seededRandom(seed) {
  let value = seed >>> 0;

  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_ARTISTS = ["RADWIMPS", "Dionela", "Amiel Sol", "Maki", "Cup of Joe", "Hev Abi"];

const MOCK_TRACKS = [
  ["Dream lantern", "RADWIMPS"],
  ["Sparkle - movie ver.", "RADWIMPS"],
  ["Sining", "Dionela"],
  ["Oksihina", "Dionela"],
  ["Tingin", "Cup of Joe"],
  ["Multo", "Cup of Joe"],
  ["Sa Susunod na Habang Buhay", "Ben&Ben"],
  ["Pasilyo", "SunKissed Lola"],
];

function buildMockStats(range) {
  const configs = {
    week: { buckets: 7, scale: 1, labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
    month: { buckets: 4, scale: 4.2, labels: ["Week 1", "Week 2", "Week 3", "Week 4"] },
    year: {
      buckets: 12,
      scale: 15,
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    },
    all: { buckets: 5, scale: 60, labels: ["2022", "2023", "2024", "2025", "2026"] },
  };

  const config = configs[range] || configs.week;
  const random = seededRandom(range.length * 7919 + range.charCodeAt(0));

  const activity = config.labels.map((label) => ({
    label,
    minutes: Math.round((20 + random() * 110) * config.scale),
  }));

  const minutesListened = activity.reduce((sum, item) => sum + item.minutes, 0);
  const tracksPlayed = Math.round(minutesListened / 3.4);

  const topArtists = MOCK_ARTISTS.map((name) => ({
    name,
    plays: Math.round((6 + random() * 40) * config.scale),
    minutes: Math.round((30 + random() * 200) * config.scale),
  }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5);

  const topTracks = MOCK_TRACKS.map(([title, artist], index) => ({
    id: `mock-track-${index}`,
    title,
    artist,
    plays: Math.round((3 + random() * 22) * config.scale),
  }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5);

  return {
    range,
    totals: {
      minutesListened,
      tracksPlayed,
      uniqueArtists: Math.max(6, Math.round(tracksPlayed / 7)),
      streakDays: Math.max(1, Math.round(3 + random() * 20)),
    },
    activity,
    topArtists,
    topTracks,
  };
}
