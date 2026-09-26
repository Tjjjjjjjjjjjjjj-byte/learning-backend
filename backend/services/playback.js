import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PLAYBACK_CACHE_DIR, PLAYBACK_CACHE_TTL_MS } from "../config.js";
import { extractPlayableAudioUrl } from "./youtube.js";

const playbackExtractionPromises = new Map();

function getPlaybackCacheFile(trackId) {
  const safeId = crypto.createHash("sha256").update(String(trackId)).digest("hex");
  return path.join(PLAYBACK_CACHE_DIR, `${safeId}.json`);
}

export function readPlaybackCache(trackId) {
  const cacheFile = getPlaybackCacheFile(trackId);
  if (!fs.existsSync(cacheFile)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
    if (!cached || cached.trackId !== trackId || typeof cached.url !== "string" || !cached.expiresAt || Date.parse(cached.expiresAt) <= Date.now()) {
      fs.unlinkSync(cacheFile);
      return null;
    }
    return cached;
  } catch {
    try { fs.unlinkSync(cacheFile); } catch { return null; }
    return null;
  }
}

function savePlaybackCache(trackId, url) {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PLAYBACK_CACHE_TTL_MS);
  fs.writeFileSync(getPlaybackCacheFile(trackId), JSON.stringify({ trackId, url, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() }, null, 2), "utf-8");
}

function invalidatePlaybackCache(trackId) {
  const cacheFile = getPlaybackCacheFile(trackId);
  if (fs.existsSync(cacheFile)) {
    try { fs.unlinkSync(cacheFile); } catch { return; }
  }
}

export function cleanupPlaybackCache() {
  if (!fs.existsSync(PLAYBACK_CACHE_DIR)) return;
  for (const filename of fs.readdirSync(PLAYBACK_CACHE_DIR)) {
    if (!filename.endsWith(".json")) continue;
    const cacheFile = path.join(PLAYBACK_CACHE_DIR, filename);
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
      if (!cached?.expiresAt || Date.parse(cached.expiresAt) <= Date.now()) fs.unlinkSync(cacheFile);
    } catch {
      try { fs.unlinkSync(cacheFile); } catch { continue; }
    }
  }
}

export async function getOrCreatePlaybackUrl(trackId, name, artist, targetDurationSeconds = null, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readPlaybackCache(trackId);
    if (cached) return { url: cached.url, cached: true };
  }

  if (forceRefresh) invalidatePlaybackCache(trackId);

  const existingPromise = playbackExtractionPromises.get(trackId);
  if (existingPromise) return { url: await existingPromise, cached: false };

  const extractionPromise = extractPlayableAudioUrl(name, artist, targetDurationSeconds)
    .then((url) => { savePlaybackCache(trackId, url); return url; })
    .finally(() => playbackExtractionPromises.delete(trackId));

  playbackExtractionPromises.set(trackId, extractionPromise);
  return { url: await extractionPromise, cached: false };
}

export async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function consume() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try { results[index] = await worker(items[index], index); }
      catch (error) { results[index] = { ok: false, error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()));
  return results;
}
