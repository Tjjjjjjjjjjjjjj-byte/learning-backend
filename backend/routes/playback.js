export function registerRoutes(app, context) {
  const {
    loadPlaybackState,
    savePlaybackState,
    MAX_PLAYBACK_HISTORY,
  } = context;

  function requireUser(req, res) {
    if (!req.session.user) {
      res.status(401).json({ message: "Must be logged in" });
      return null;
    }

    return req.session.user.username;
  }

  app.get("/playback/state", (req, res) => {
    const username = requireUser(req, res);
    if (!username) return;

    return res.status(200).json({
      state: loadPlaybackState(username),
    });
  });

  app.put("/playback/state", (req, res) => {
    const username = requireUser(req, res);
    if (!username) return;

    const payload = req.body?.state;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        message: "Playback state is required",
      });
    }

    const trackId = String(payload.trackId || "").trim();
    const title = String(payload.title || "").trim();
    const artist = String(payload.artist || "").trim();

    if (!trackId || !title || !artist) {
      return res.status(400).json({
        message: "trackId, title, and artist are required",
      });
    }

    const existing = loadPlaybackState(username) || {};
    const now = new Date().toISOString();
    const event = String(req.body?.event || "progress");
    const completed = Boolean(payload.completed);
    const position = Number.isFinite(Number(payload.position))
      ? Math.max(0, Number(payload.position))
      : 0;
    const duration = Number.isFinite(Number(payload.duration))
      ? Math.max(0, Number(payload.duration))
      : 0;

    const normalizedState = {
      trackId,
      title,
      artist,
      album: payload.album || "",
      artwork: payload.artwork || "",
      duration,
      source: payload.source || "",
      sourceUrl: payload.sourceUrl || "",
      position,
      updatedAt: payload.updatedAt || now,
      completed,
      playlistId: payload.playlistId ?? null,
      playlistName: payload.playlistName || "",
      queueIndex:
        Number.isInteger(Number(payload.queueIndex)) && Number(payload.queueIndex) >= 0
          ? Number(payload.queueIndex)
          : null,
    };

    let history = Array.isArray(existing.history)
      ? existing.history.slice(-MAX_PLAYBACK_HISTORY)
      : [];

    const latest = history[history.length - 1];
    const shouldStartNewEntry =
      event === "track-change" ||
      event === "start" ||
      !latest ||
      latest.trackId !== trackId;

    if (shouldStartNewEntry) {
      history.push({
        trackId,
        playedAt: now,
        position,
        duration,
        completed,
        liked: Boolean(payload.liked),
        title,
        artist,
      });
    } else {
      history[history.length - 1] = {
        ...latest,
        position,
        duration,
        completed,
        title,
        artist,
        ...(payload.liked !== undefined
          ? { liked: Boolean(payload.liked) }
          : {}),
      };
    }

    history = history.slice(-MAX_PLAYBACK_HISTORY);

    const nextState = {
      ...normalizedState,
      history,
    };

    savePlaybackState(username, nextState);

    return res.status(200).json({
      state: nextState,
    });
  });

  app.get("/playback/history", (req, res) => {
    const username = requireUser(req, res);
    if (!username) return;

    const state = loadPlaybackState(username) || {};
    const history = Array.isArray(state.history) ? state.history : [];
    const likedOnly = req.query.liked === "true";

    return res.status(200).json({
      history: likedOnly
        ? history.filter((entry) => entry?.liked)
        : history,
    });
  });
}
