import {
  sendSpotifyError,
  getSpotifyRateLimitStatus,
} from "../services/spotifyHttp.js";
import { getCachedTrack } from "../services/spotifyTracks.js";

export function registerRoutes(app, context) {
  const {
    getSpotifyToken,
    getSpotifyPublicPlaylist,
    extractSpotifyPlaylistId,
    loadSpotifyPublicPlaylists,
    saveSpotifyPublicPlaylists,
  } = context;

  function requireUser(req, res) {
    if (!req.session.user) {
      res.status(401).json({
        message: "Must be logged in",
      });

      return false;
    }

    return true;
  }

  /*
   * GET /spotify/status?trackId=XXXX
   *
   * Cheap, no Spotify call: reads the in-memory cooldown state. The client
   * asks this before starting a track so it can show the normal loading
   * state (instead of silently doing nothing) while Spotify is limiting us.
   *
   * `ready` is true when we can play right now: either Spotify isn't
   * limiting us, or everything needed for this track is already cached.
   */
  app.get("/spotify/status", (req, res) => {
    const status = getSpotifyRateLimitStatus();
    const trackId = String(req.query.trackId || "").trim();

    const trackCached = trackId ? Boolean(getCachedTrack(trackId)) : false;
    const playbackCached =
      trackId && typeof context.readPlaybackCache === "function"
        ? Boolean(context.readPlaybackCache(trackId))
        : false;

    return res.status(200).json({
      ...status,
      trackId: trackId || null,
      trackCached,
      playbackCached,
      ready: !status.rateLimited || trackCached || playbackCached,
    });
  });

  /*
   * GET SAVED PUBLIC PLAYLISTS
   */
  app.get("/spotify/playlist/saved", (req, res) => {
    if (!requireUser(req, res)) return;

    const username = req.session.user.username;
    const saved = loadSpotifyPublicPlaylists();

    return res.status(200).json({
      playlists: Array.isArray(saved[username])
        ? saved[username]
        : [],
    });
  });

  /*
   * GET PUBLIC SPOTIFY PLAYLIST
   *
   * Example:
   * GET /spotify/playlist/5PGMpxcsrMTutimlXMVlE8
   */
  app.get(
    "/spotify/playlist/:playlistId",
    async (req, res) => {
      try {
        const playlist = await getSpotifyPublicPlaylist(
          req.params.playlistId,
          getSpotifyToken,
        );

        /*
         * The search page only needs playlist metadata here.
         * Track loading is handled by the /tracks endpoint.
         */
        return res.status(200).json({
          ...playlist,
          tracks: playlist.tracks,
        });
      } catch (error) {
        console.error(
          "PUBLIC SPOTIFY PLAYLIST ERROR:",
          error,
        );

        /*
         * Preserve Spotify's actual HTTP status instead of
         * converting every failure into 404.
         */
        return sendSpotifyError(res, error, "Failed to load public Spotify playlist");
      }
    },
  );

  /*
   * GET PUBLIC SPOTIFY PLAYLIST TRACKS
   *
   * Example:
   * GET /spotify/playlist/5PGMpxcsrMTutimlXMVlE8/tracks
   */
  app.get(
    "/spotify/playlist/:playlistId/tracks",
    async (req, res) => {
      try {
        const playlist = await getSpotifyPublicPlaylist(
          req.params.playlistId,
          getSpotifyToken,
        );

        const username =
          req.session.user?.username;

        // Same "about to play this" signal as the local-playlist tracks
        // route, for the home dashboard's Recents row.
        if (username && typeof context.recordRecentPlaylist === "function") {
          context.recordRecentPlaylist(
            username,
            `spotify:${playlist.spotifyPlaylistId}`,
          );
        }

        const downloadedIds = username
          ? new Set(
              context
                .getUserDownloads(username)
                .map((download) => download.trackId),
            )
          : new Set();

        return res.status(200).json({
          ok: true,
          type: playlist.type,
          spotifyPlaylistId: playlist.spotifyPlaylistId,
          playlist: {
            id: playlist.spotifyPlaylistId,
            name: playlist.name,
            owner: playlist.owner,
            description: playlist.description,
            cover: playlist.cover,
            externalUrl: playlist.externalUrl,
            trackCount: playlist.trackCount,
          },
          itemsStatus: playlist.itemsStatus,
          itemsMessage: playlist.itemsMessage,
          tracksAvailable: playlist.tracksAvailable,
          tracksReason: playlist.tracksReason,
          trackCount: playlist.trackCount,
          tracks: playlist.tracks.map((track, index) => ({
            ...track,
            downloaded: downloadedIds.has(track.id),
            addedAt: null,
            publicPlaylistIndex: index,
          })),
        });
      } catch (error) {
        console.error(
          "PUBLIC SPOTIFY PLAYLIST TRACKS ERROR:",
          error,
        );

        return sendSpotifyError(res, error, "Failed to load Spotify playlist tracks");
      }
    },
  );

  /*
   * SAVE PUBLIC SPOTIFY PLAYLIST
   *
   * A lightweight reference only -- name/cover/description/trackCount.
   * Deliberately skips per-track artwork enrichment (skipTrackEnrichment)
   * since this route never touches individual tracks, which keeps it
   * working even when Spotify is rate-limiting the per-track lookups.
   */
  app.post(
    "/spotify/playlist/:playlistId/save",
    async (req, res) => {
      if (!requireUser(req, res)) return;

      try {
        const playlist =
          await getSpotifyPublicPlaylist(
            req.params.playlistId,
            getSpotifyToken,
            { skipTrackEnrichment: true },
          );

        const username =
          req.session.user.username;

        const saved =
          loadSpotifyPublicPlaylists();

        const userSaved =
          Array.isArray(saved[username])
            ? saved[username]
            : [];

        // Preserve the original save date across re-saves (e.g. re-saving
        // to refresh metadata) so "newest"/"oldest" on the home dashboard
        // reflects when the user actually added it, not the last refresh.
        const previous = userSaved.find(
          (item) =>
            item.spotifyPlaylistId === playlist.spotifyPlaylistId,
        );

        const reference = {
          id: `spotify:${playlist.spotifyPlaylistId}`,

          type: "spotify-public",

          spotifyPlaylistId:
            playlist.spotifyPlaylistId,

          name: playlist.name,

          owner: playlist.owner,

          description: playlist.description,

          cover: playlist.cover,

          externalUrl:
            playlist.externalUrl,

          trackCount:
            playlist.trackCount,

          createdAt:
            previous?.createdAt || new Date().toISOString(),

          updatedAt:
            new Date().toISOString(),
        };

        const next = [
          ...userSaved.filter(
            (item) =>
              item.spotifyPlaylistId !==
              playlist.spotifyPlaylistId,
          ),

          reference,
        ];

        saved[username] = next;

        saveSpotifyPublicPlaylists(saved);

        return res.status(200).json({
          message:
            "Public Spotify playlist saved",

          playlist: reference,
        });
      } catch (error) {
        console.error(
          "SAVE PUBLIC SPOTIFY PLAYLIST ERROR:",
          error,
        );

        return sendSpotifyError(res, error, "Failed to save Spotify playlist");
      }
    },
  );

  /*
   * REMOVE SAVED PUBLIC SPOTIFY PLAYLIST
   */
  app.delete(
    "/spotify/playlist/:playlistId/save",
    (req, res) => {
      if (!requireUser(req, res)) return;

      const username =
        req.session.user.username;

      const saved =
        loadSpotifyPublicPlaylists();

      const userSaved =
        Array.isArray(saved[username])
          ? saved[username]
          : [];

      saved[username] = userSaved.filter(
        (item) =>
          item.spotifyPlaylistId !==
          req.params.playlistId,
      );

      saveSpotifyPublicPlaylists(saved);

      return res.status(200).json({
        message:
          "Saved Spotify playlist removed",
      });
    },
  );

  /*
   * RESOLVE SPOTIFY PLAYLIST URL
   *
   * Example body:
   * {
   *   "url": "https://open.spotify.com/playlist/..."
   * }
   */
  app.post(
    "/spotify/playlist/resolve",
    async (req, res) => {
      if (!requireUser(req, res)) return;

      const playlistId =
        extractSpotifyPlaylistId(
          req.body?.url,
        );

      if (!playlistId) {
        return res.status(400).json({
          message:
            "Invalid Spotify public playlist URL",
        });
      }

      try {
        const playlist =
          await getSpotifyPublicPlaylist(
            playlistId,
            getSpotifyToken,
          );

        return res.status(200).json({
          ...playlist,
          tracks: playlist.tracks,
        });
      } catch (error) {
        console.error(
          "RESOLVE PUBLIC SPOTIFY PLAYLIST ERROR:",
          error,
        );

        return sendSpotifyError(res, error, "Failed to load Spotify playlist");
      }
    },
  );
}