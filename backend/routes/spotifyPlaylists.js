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
          tracks: undefined,
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
        const status =
          Number.isInteger(error?.status) &&
          error.status >= 400 &&
          error.status <= 599
            ? error.status
            : 502;

        return res.status(status).json({
          message:
            error?.message ||
            "Failed to load public Spotify playlist",
        });
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

        const downloadedIds = username
          ? new Set(
              context
                .getUserDownloads(username)
                .map((download) => download.trackId),
            )
          : new Set();

        return res.status(200).json(
          playlist.tracks.map((track, index) => ({
            ...track,

            downloaded: downloadedIds.has(
              track.id,
            ),

            addedAt: null,

            publicPlaylistIndex: index,
          })),
        );
      } catch (error) {
        console.error(
          "PUBLIC SPOTIFY PLAYLIST TRACKS ERROR:",
          error,
        );

        const status =
          Number.isInteger(error?.status) &&
          error.status >= 400 &&
          error.status <= 599
            ? error.status
            : 502;

        return res.status(status).json({
          message:
            error?.message ||
            "Failed to load Spotify playlist tracks",
        });
      }
    },
  );

  /*
   * SAVE PUBLIC SPOTIFY PLAYLIST
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
          );

        const username =
          req.session.user.username;

        const saved =
          loadSpotifyPublicPlaylists();

        const userSaved =
          Array.isArray(saved[username])
            ? saved[username]
            : [];

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

        const status =
          Number.isInteger(error?.status) &&
          error.status >= 400 &&
          error.status <= 599
            ? error.status
            : 502;

        return res.status(status).json({
          message:
            error?.message ||
            "Failed to save Spotify playlist",
        });
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
          tracks: undefined,
        });
      } catch (error) {
        console.error(
          "RESOLVE PUBLIC SPOTIFY PLAYLIST ERROR:",
          error,
        );

        const status =
          Number.isInteger(error?.status) &&
          error.status >= 400 &&
          error.status <= 599
            ? error.status
            : 502;

        return res.status(status).json({
          message:
            error?.message ||
            "Failed to load Spotify playlist",
        });
      }
    },
  );
}