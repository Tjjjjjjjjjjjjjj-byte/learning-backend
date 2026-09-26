import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const PORT = 3000;
export const DOWNLOADS_FILE = path.join(PROJECT_ROOT, "downloads.json");
export const DOWNLOAD_DIR = path.join(PROJECT_ROOT, "downloads");
export const PASSWORD_RESETS_FILE = path.join(PROJECT_ROOT, "passwordResets.json");
export const PLAYBACK_CACHE_DIR = path.join(PROJECT_ROOT, "temp", "playback-cache");
export const PLAYBACK_CACHE_TTL_MS = 30 * 60 * 1000;
export const PLAYBACK_PRELOAD_CONCURRENCY = 3;
export const LYRIC_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
