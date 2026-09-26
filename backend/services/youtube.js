import { spawn } from "child_process";

export function runYtDlp(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const process = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (!process.killed) process.kill("SIGKILL");
      reject(new Error("yt-dlp process timed out"));
    }, timeoutMs);

    process.stdout.on("data", (data) => { stdout += data.toString(); });
    process.stderr.on("data", (data) => { stderr += data.toString(); });
    process.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    process.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function getDurationToleranceSeconds(targetDurationSeconds) {
  if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0) return null;
  return Math.min(30, Math.max(15, targetDurationSeconds * 0.05));
}

export function selectYoutubeVideo(results, artist, targetDurationSeconds) {
  const normalizedArtist = String(artist || "").trim().toLowerCase();
  const tolerance = getDurationToleranceSeconds(targetDurationSeconds);
  const withArtistMatch = results.filter((video) => normalizedArtist && video.uploader?.toLowerCase().includes(normalizedArtist));
  const artistFallback = withArtistMatch[0] || results[0];

  if (tolerance === null) return artistFallback;

  const durationCandidates = results.filter(
    (video) => Number.isFinite(video.duration) && Math.abs(video.duration - targetDurationSeconds) <= tolerance,
  );

  if (!durationCandidates.length) return artistFallback;

  return durationCandidates.slice().sort((a, b) => {
    const durationDifference = Math.abs(a.duration - targetDurationSeconds) - Math.abs(b.duration - targetDurationSeconds);
    if (durationDifference !== 0) return durationDifference;
    return Number(b.artistMatch) - Number(a.artistMatch);
  })[0];
}

export async function findYoutubeVideo(name, artist, targetDurationSeconds = null) {
  const trackQuery = `${name} ${artist}`;
  const result = await runYtDlp(["--skip-download", "--flat-playlist", "--dump-single-json", `ytsearch5:${trackQuery}`]);
  let searchData;
  try { searchData = JSON.parse(result.stdout); } catch { throw new Error("YouTube search returned invalid data"); }

  const normalizedArtist = String(artist || "").trim().toLowerCase();
  const results = (searchData.entries || []).map((entry) => {
    const rawId = entry.id || entry.url;
    const id = typeof rawId === "string" ? rawId.replace(/^https?:\/\/(www\.)?youtube\.com\/watch\?v=/, "") : "";
    const uploader = entry.uploader || entry.channel || "";
    const artistMatch = normalizedArtist.length > 0 && String(uploader).toLowerCase().includes(normalizedArtist);
    const duration = Number(entry.duration);
    return {
      id,
      title: entry.title || "",
      uploader,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      artistMatch,
      url: entry.webpage_url || (typeof rawId === "string" && rawId.startsWith("http") ? rawId : id ? `https://www.youtube.com/watch?v=${id}` : ""),
    };
  }).filter((video) => video.id && video.url);

  if (!results.length) throw new Error("Song not found on YouTube");
  return selectYoutubeVideo(results, artist, targetDurationSeconds);
}

export async function extractPlayableAudioUrl(name, artist, targetDurationSeconds = null) {
  const video = await findYoutubeVideo(name, artist, targetDurationSeconds);
  const result = await runYtDlp(["--no-playlist", "--format", "bestaudio/best", "--get-url", video.url]);
  const audioUrl = result.stdout.trim().split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("http://") || line.startsWith("https://"));
  if (!audioUrl) throw new Error("yt-dlp returned no playable audio URL");
  try {
    const parsedUrl = new URL(audioUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Unsupported audio URL protocol");
  } catch { throw new Error("yt-dlp returned an invalid audio URL"); }
  return audioUrl;
}
