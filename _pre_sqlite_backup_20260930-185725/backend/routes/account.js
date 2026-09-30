// Account / privacy routes: clear server-side caches and delete the account.
export function registerRoutes(app, context) {
  const {
    fs,
    path,
    PROJECT_ROOT,
    PLAYBACK_CACHE_DIR,
    PLAYBACK_STATE_FILE,
    DOWNLOADS_FILE,
    lyricsCache,
  } = context;

  function requireUser(req, res) {
    const username = req.session?.user?.username;

    if (!username) {
      res.status(401).json({ message: "Must be logged in" });
      return null;
    }

    return username;
  }

  function readJson(file, fallback) {
    try {
      if (!fs.existsSync(file)) return fallback;
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return fallback;
    }
  }

  function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  }

  /*
   * POST /account/clear-cache
   * Removes cached playback URLs and lyrics. Downloads, playlists and
   * playback history are NOT touched.
   */
  app.post("/account/clear-cache", (req, res) => {
    if (!requireUser(req, res)) return;

    let removed = 0;

    try {
      if (fs.existsSync(PLAYBACK_CACHE_DIR)) {
        for (const filename of fs.readdirSync(PLAYBACK_CACHE_DIR)) {
          if (!filename.endsWith(".json")) continue;

          try {
            fs.unlinkSync(path.join(PLAYBACK_CACHE_DIR, filename));
            removed += 1;
          } catch {
            // skip files that are locked or already gone
          }
        }
      }

      if (lyricsCache && typeof lyricsCache.clear === "function") {
        removed += lyricsCache.size || 0;
        lyricsCache.clear();
      }
    } catch (error) {
      console.error("CLEAR CACHE ERROR:", error);
      return res.status(500).json({ message: "Failed to clear cache" });
    }

    return res.status(200).json({ message: "Cache cleared", removed });
  });

  /*
   * DELETE /account   body: { password }
   * Permanently deletes the logged-in user and everything stored for them.
   */
  app.delete("/account", (req, res) => {
    const username = requireUser(req, res);
    if (!username) return;

    const password = String(req.body?.password ?? "");
    const usersFile = path.join(PROJECT_ROOT, "users.json");
    const users = readJson(usersFile, []);
    const user = users.find((candidate) => candidate.identifier === username);

    if (!user) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (user.password !== password) {
      return res.status(403).json({ message: "Incorrect password" });
    }

    try {
      // 1. user record
      writeJson(
        usersFile,
        users.filter((candidate) => candidate.identifier !== username),
      );

      // 2. playlists
      const playlistsFile = path.join(PROJECT_ROOT, "playlists.json");
      const playlists = readJson(playlistsFile, []);
      writeJson(
        playlistsFile,
        playlists.filter((playlist) => playlist.owner !== username),
      );

      // 3. saved public Spotify playlists
      const publicFile = path.join(PROJECT_ROOT, "spotifyPublicPlaylists.json");
      const publicPlaylists = readJson(publicFile, {});
      delete publicPlaylists[username];
      writeJson(publicFile, publicPlaylists);

      // 4. playback state + history
      const playbackStates = readJson(PLAYBACK_STATE_FILE, {});
      delete playbackStates[username];
      writeJson(PLAYBACK_STATE_FILE, playbackStates);

      // 5. recently played
      const recentFile = path.join(PROJECT_ROOT, "recentlyPlayed.json");
      if (fs.existsSync(recentFile)) {
        const recents = readJson(recentFile, {});
        delete recents[username];
        writeJson(recentFile, recents);
      }

      // 6. pending password-reset tokens
      const resetsFile = path.join(PROJECT_ROOT, "passwordResets.json");
      if (fs.existsSync(resetsFile)) {
        const resets = readJson(resetsFile, {});
        for (const [token, entry] of Object.entries(resets)) {
          if (entry?.username === username) delete resets[token];
        }
        writeJson(resetsFile, resets);
      }

      // 7. downloads: drop this user's entries, delete a file only if no
      //    other account still references it
      const downloads = readJson(DOWNLOADS_FILE, {});
      const mine = Array.isArray(downloads[username]) ? downloads[username] : [];
      delete downloads[username];

      const stillUsed = new Set(
        Object.values(downloads)
          .flat()
          .map((entry) => entry?.file)
          .filter(Boolean),
      );

      for (const entry of mine) {
        if (!entry?.file || stillUsed.has(entry.file)) continue;

        try {
          const filePath = path.isAbsolute(entry.file)
            ? entry.file
            : path.join(PROJECT_ROOT, entry.file);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
          // best effort
        }
      }

      writeJson(DOWNLOADS_FILE, downloads);
    } catch (error) {
      console.error("DELETE ACCOUNT ERROR:", error);
      return res.status(500).json({ message: "Failed to delete account" });
    }

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      return res.status(200).json({ message: "Account deleted" });
    });
  });
}
