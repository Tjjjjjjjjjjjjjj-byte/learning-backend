import { getTracksByIds } from "../services/spotifyTracks.js";

// Spotify's own editorial playlists -- reusing the Spotify integration this
// app already has everywhere else, rather than adding a separate charts API.
const WORLDWIDE_PLAYLIST_ID = "37i9dQZEVXbMDoHDwVN2tF"; // Top 50 - Global
const STATION_PLAYLIST_IDS = [
  ["37i9dQZF1DXcBWIGoYBM5M", "Today's Top Hits"],
  ["37i9dQZF1DX0XUsuxWHRQd", "RapCaviar"],
  ["37i9dQZF1DWXRqgorJj26U", "Rock Classics"],
  ["37i9dQZF1DX4WYpdgoIcn6", "Chill Hits"],
  ["37i9dQZF1DX3rxVfibe1L0", "Mood Booster"],
  ["37i9dQZF1DX4sWSpwq3LiO", "Peaceful Piano"],
];

// Editorial playlist metadata barely changes minute to minute, and this is
// shared across every user, so a short in-memory cache means only the
// first dashboard load of the process actually calls Spotify for it.
const CURATED_CACHE_TTL_MS = 30 * 60 * 1000;
let curatedCache = null; // { data, expiresAt }

function toEpoch(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function summarizePlaylist(playlist) {
  return {
    id: playlist.id,
    type: playlist.type === "spotify-public" ? "spotify-public" : "local",
    name: playlist.name,
    owner: playlist.owner,
    cover: playlist.cover,
    trackCount: Array.isArray(playlist.songs)
      ? playlist.songs.length
      : Number.isFinite(playlist.trackCount)
        ? playlist.trackCount
        : null,
    createdAt: playlist.createdAt || playlist.updatedAt || null,
  };
}

/*
 * Top artists across the tracks the user has actually added to their own
 * (locally-created) playlists. Deliberately scoped to those, not also to
 * saved Spotify playlists: this app never stores a saved public playlist's
 * full track list locally, and fetching every track of every saved
 * playlist just to build a dashboard widget would mean a lot of extra
 * Spotify calls on every load. Artist metadata comes from the same cached
 * track resolver every other track lookup in the app uses, so this reuses
 * whatever's already cached and only fetches what it's missing.
 */
async function getTopArtists(userPlaylists, downloadsByTrackId, limit) {
  const trackIds = new Set();

  for (const playlist of userPlaylists) {
    for (const songId of Array.isArray(playlist.songs) ? playlist.songs : []) {
      trackIds.add(songId);
    }
  }

  if (trackIds.size === 0) return [];

  const { tracks } = await getTracksByIds([...trackIds]);

  const artistCounts = new Map(); // key: lowercased name -> { name, count, cover }

  function tally(name, cover) {
    const cleaned = String(name || "").trim();
    if (!cleaned) return;

    const key = cleaned.toLowerCase();
    const existing = artistCounts.get(key);

    if (existing) {
      existing.count += 1;
      if (!existing.cover && cover) existing.cover = cover;
    } else {
      artistCounts.set(key, { name: cleaned, count: 1, cover: cover || null });
    }
  }

  for (const trackId of trackIds) {
    const track = tracks.get(trackId);

    if (track) {
      const cover = track.album?.images?.[0]?.url || null;
      const artistNames = Array.isArray(track.artists)
        ? track.artists.map((artist) => artist?.name).filter(Boolean)
        : [];

      if (artistNames.length > 0) {
        artistNames.forEach((name) => tally(name, cover));
        continue;
      }
    }

    // Spotify lookup didn't resolve this one (rate limited, etc.) -- fall
    // back to the artist name recorded when the file was downloaded, if
    // any, so a temporary Spotify hiccup doesn't skew the count.
    const download = downloadsByTrackId.get(trackId);
    if (download?.artist) tally(download.artist, null);
  }

  return [...artistCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ name, count, cover }) => ({ name, songCount: count, cover }));
}

async function getCuratedPlaylists(getSpotifyToken, getSpotifyPublicPlaylist) {
  if (curatedCache && curatedCache.expiresAt > Date.now()) {
    return curatedCache.data;
  }

  const ids = [WORLDWIDE_PLAYLIST_ID, ...STATION_PLAYLIST_IDS.map(([id]) => id)];

  const results = await Promise.allSettled(
    ids.map((id) =>
      getSpotifyPublicPlaylist(id, getSpotifyToken, { skipTrackEnrichment: true }),
    ),
  );

  const [worldwideResult, ...stationResults] = results;

  const worldwide =
    worldwideResult.status === "fulfilled"
      ? {
          id: `spotify:${worldwideResult.value.spotifyPlaylistId}`,
          name: worldwideResult.value.name,
          cover: worldwideResult.value.cover,
          trackCount: worldwideResult.value.trackCount,
        }
      : null;

  const stations = stationResults
    .map((result, index) =>
      result.status === "fulfilled"
        ? {
            id: `spotify:${result.value.spotifyPlaylistId}`,
            name: result.value.name || STATION_PLAYLIST_IDS[index][1],
            cover: result.value.cover,
            trackCount: result.value.trackCount,
          }
        : null,
    )
    .filter(Boolean);

  const data = { worldwide, stations };

  // Only cache a full success -- if Spotify rate-limited some of these,
  // let the next request try again soon rather than caching gaps.
  if (worldwide && stations.length === STATION_PLAYLIST_IDS.length) {
    curatedCache = { data, expiresAt: Date.now() + CURATED_CACHE_TTL_MS };
  }

  return data;
}

export function registerRoutes(app, context) {
  const {
    loadPlaylists,
    loadSpotifyPublicPlaylists,
    getUserDownloads,
    getSpotifyToken,
    getSpotifyPublicPlaylist,
    getRecentPlaylistIds,
  } = context;

  app.get("/home/dashboard", async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Must be logged in" });
    }

    const username = req.session.user.username;

    try {
      const allPlaylists = loadPlaylists();
      const userPlaylists = allPlaylists.filter(
        (playlist) => playlist.owner === username,
      );

      const savedPublic = loadSpotifyPublicPlaylists();
      const publicPlaylists = Array.isArray(savedPublic[username])
        ? savedPublic[username]
        : [];

      const combined = [...userPlaylists, ...publicPlaylists];
      const byId = new Map(combined.map((playlist) => [String(playlist.id), playlist]));

      const recentIds =
        typeof getRecentPlaylistIds === "function"
          ? getRecentPlaylistIds(username, 10)
          : [];

      const recents = recentIds
        .map((id) => byId.get(String(id)))
        .filter(Boolean)
        .map(summarizePlaylist);

      const byDate = [...combined].sort(
        (a, b) => toEpoch(a.createdAt || a.updatedAt) - toEpoch(b.createdAt || b.updatedAt),
      );

      const oldest = byDate.slice(0, 3).map(summarizePlaylist);
      const newest = byDate.slice(-3).reverse().map(summarizePlaylist);

      const downloads = getUserDownloads(username);
      const downloadsByTrackId = new Map(
        downloads.map((download) => [download.trackId, download]),
      );

      const [topArtists, curated] = await Promise.all([
        getTopArtists(userPlaylists, downloadsByTrackId, 6).catch((error) => {
          console.error("DASHBOARD TOP ARTISTS ERROR:", error.message);
          return [];
        }),
        typeof getSpotifyPublicPlaylist === "function"
          ? getCuratedPlaylists(getSpotifyToken, getSpotifyPublicPlaylist).catch((error) => {
              console.error("DASHBOARD CURATED PLAYLISTS ERROR:", error.message);
              return { worldwide: null, stations: [] };
            })
          : { worldwide: null, stations: [] },
      ]);

      return res.status(200).json({
        recents,
        oldest,
        newest,
        topArtists,
        worldwide: curated.worldwide,
        stations: curated.stations,
        hasAnyPlaylists: combined.length > 0,
      });
    } catch (error) {
      console.error("DASHBOARD ERROR:", error);
      return res.status(500).json({ message: "Failed to load dashboard" });
    }
  });
}
