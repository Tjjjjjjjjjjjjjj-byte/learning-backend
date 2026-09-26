import { extractSpotifyPlaylistId, getSpotifyPublicPlaylist } from "../services/spotifyPlaylist.js";

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

      const token = await getSpotifyToken();
      const tracks = [];
      const artists = [];
      const albums = [];

      let offset = 0;
      const limit = 10;
      const maxRequests = 10;

      while (
        tracks.length + artists.length + albums.length < 50 &&
        offset < maxRequests * limit
      ) {
        const response = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(
            userSearch,
          )}&type=track,artist,album&limit=${limit}&offset=${offset}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          return res.status(response.status).json(data);
        }

        if (data.tracks?.items) tracks.push(...data.tracks.items);
        if (data.artists?.items) artists.push(...data.artists.items);
        if (data.albums?.items) albums.push(...data.albums.items);

        offset += limit;

        if (
          !data.tracks?.items?.length &&
          !data.artists?.items?.length &&
          !data.albums?.items?.length
        ) {
          break;
        }
      }

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

      return res.status(error.status === 404 ? 404 : 500).json({
        message:
          error.status === 404
            ? "Spotify public playlist not found"
            : error.message,
      });
    }
  });
}
