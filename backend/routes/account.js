// Account / privacy routes: clear server-side caches and delete the account.
export function registerRoutes(app, context) {
  const {
    fs,
    path,
    PROJECT_ROOT,
    PLAYBACK_CACHE_DIR,
    lyricsCache,
    findUserByIdentifier,
    deleteUserAccount,
  } = context;

  function requireUser(req, res) {
    const username = req.session?.user?.username;

    if (!username) {
      res.status(401).json({ message: "Must be logged in" });
      return null;
    }

    return username;
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
    const user = findUserByIdentifier(username);

    if (!user) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (user.password !== password) {
      return res.status(403).json({ message: "Incorrect password" });
    }

    try {
      // Every table is cleaned in one transaction: all of it or none of it.
      // Returns the mp3 entries no other account still uses.
      const orphanedDownloads = deleteUserAccount(username);

      for (const entry of orphanedDownloads) {
        try {
          const filePath = path.isAbsolute(entry.file)
            ? entry.file
            : path.join(PROJECT_ROOT, entry.file);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
          // best effort
        }
      }
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
