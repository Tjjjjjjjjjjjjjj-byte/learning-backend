import { spawn } from "child_process";

let mpvProcess = null;

export function registerRoutes(app) {
  app.post("/stream", (req, res) => {
    const { track } = req.body;

    if (mpvProcess) {
      mpvProcess.kill;
    }

    const ytdlp = spawn("yt-dlp", [
      "-f",
      "bestaudio",
      "o",
      "-",
      "--quiet",
      "--no-warnings",
    ]);

    const mpv = spawn("mpv", [
      "--no-videp",
      "cache=yes",
      "--input-ipc-server=/tmp/mpv-socket",
      "-",
    ]);

    mpvProcess = mpv;
    ytdlp.stdout.pipe(mpv.stdin);
  });
}
