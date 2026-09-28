import { extractSpotifyPlaylistId, getSpotifyPublicPlaylist } from "../services/spotifyPlaylist.js";
import {
  guardedFetch,
  singleFlight,
  invalidateSpotifyToken,
  sendSpotifyError,
} from "../services/spotifyHttp.js";

// Identical searches (typing, re-renders, StrictMode double effects) are
// answered from memory instead of costing up to 10 Spotify requests each.
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const SEARCH_CACHE_MAX = 200;
const searchCache = new Map();

function getCachedSearch(key) {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedSearch(key, value) {
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, { createdAt: Date.now(), value });
}

// API routes for search.
export function registerRoutes(app, context) {
  const { getSpotifyToken, getUserDownloads } = context;

  app.get("/search", async (req, res) => {
    try {
      const userSearch = String(req.query.q || "").trim();

      if (!userSearch) {
        return res.status(400).json({
          message: "Missing search query",
        });
      }

      const playlistId = extractSpotifyPlaylistId(userSearch);

      if (playlistId) {
        const playlist = await getSpotifyPublicPlaylist(
          playlistId,
          getSpotifyToken,
        );

        return res.json({
          playlist: {
            ...playlist,
            tracks: playlist.tracks,
          },
          tracks: { items: playlist.tracks },
          artists: { items: [] },
          albums: { items: [] },
        });
      }

      const cacheKey = userSearch.toLowerCase();

      const { tracks, artists, albums } =
        getCachedSearch(cacheKey) ||
        (await singleFlight(`search:${cacheKey}`, async () => {
          const token = await getSpotifyToken();
          const found = { tracks: [], artists: [], albums: [] };

          let offset = 0;
          const limit = 10;
          const maxRequests = 10;

          while (
            found.tracks.length + found.artists.length + found.albums.length < 50 &&
            offset < maxRequests * limit
          ) {
            const response = await guardedFetch(
              "api",
              `https://api.spotify.com/v1/search?q=${encodeURIComponent(
                userSearch,
              )}&type=track,artist,album&limit=${limit}&offset=${offset}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );

            const data = await response.json().catch(() => null);

            if (response.status === 401) invalidateSpotifyToken();

            if (!response.ok) {
              // Keep whatever pages we already got instead of throwing the
              // whole search away because a later page failed.
              if (offset > 0) break;

              const error = new Error(
                data?.error?.message || `Spotify search failed (HTTP ${response.status})`,
              );
              error.status = response.status;
              throw error;
            }

            if (data.tracks?.items) found.tracks.push(...data.tracks.items);
            if (data.artists?.items) found.artists.push(...data.artists.items);
            if (data.albums?.items) found.albums.push(...data.albums.items);

            offset += limit;

            if (
              !data.tracks?.items?.length &&
              !data.artists?.items?.length &&
              !data.albums?.items?.length
            ) {
              break;
            }
          }

          setCachedSearch(cacheKey, found);
          return found;
        }));

      const selectedArtists = artists.slice(0, 5);
      const selectedAlbums = albums.slice(0, 5);
      const remainingSlots = 50 - selectedArtists.length - selectedAlbums.length;
      const selectedTracks = tracks.slice(0, remainingSlots);

      const downloadedIds = req.session.user
        ? new Set(
            getUserDownloads(req.session.user.username).map(
              (download) => download.trackId,
            ),
          )
        : new Set();

      const tracksWithDownloadState = selectedTracks.map((track) => ({
        ...track,
        downloaded: downloadedIds.has(track.id),
      }));

      return res.json({
        playlist: null,
        tracks: { items: tracksWithDownloadState },
        artists: { items: selectedArtists },
        albums: { items: selectedAlbums },
      });
    } catch (error) {
      console.error("Spotify search error:", error);

      if (error.status === 404) {
        return res.status(404).json({
          message: "Spotify public playlist not found",
        });
      }

      return sendSpotifyError(res, error, "Search failed");
    }
  });
}
