/*
 * One place that every Spotify request goes through.
 *
 * Fixes the classic rate-limit failure modes:
 *  1. A new client-credentials token was requested for EVERY call (tokens
 *     last ~1h) -> now cached + shared between concurrent callers.
 *  2. A 429 was never remembered, so every following request kept hammering
 *     Spotify -> now a per-host cooldown that honours Retry-After and makes
 *     later calls fail instantly (no network) until it expires.
 *  3. Bursts of parallel requests -> per-host concurrency + spacing limiter.
 *  4. Identical concurrent requests (React StrictMode, /playlist + /tracks
 *     fired together) -> single-flight de-duplication.
 */

export class SpotifyRateLimitError extends Error {
  constructor(bucket, retryAfterSeconds) {
    super(
      `Spotify rate limit (${bucket}); retry in ${retryAfterSeconds}s`,
    );
    this.name = "SpotifyRateLimitError";
    this.status = 429;
    this.bucket = bucket;
    this.retryAfterSeconds = retryAfterSeconds;
    this.rateLimited = true;
  }
}

const MAX_COOLDOWN_SECONDS = 3600;
const DEFAULT_BACKOFF_STEPS = [5, 10, 20, 40, 80, 120];
const REQUEST_TIMEOUT_MS = 10_000;

// Independent buckets: being limited on the embed pages says nothing about
// the official API or the token endpoint, and vice-versa.
const BUCKET_CONFIG = {
  api: { concurrency: 4, gapMs: 0 },
  embed: { concurrency: 3, gapMs: 150 },
  accounts: { concurrency: 1, gapMs: 0 },
};

const cooldownUntil = new Map(); // bucket -> epoch ms
const consecutive429 = new Map(); // bucket -> count (for header-less 429s)

function createLimiter({ concurrency, gapMs }) {
  let active = 0;
  let lastStart = 0;
  const queue = [];

  function pump() {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      active += 1;

      const wait = Math.max(0, lastStart + gapMs - Date.now());
      lastStart = Date.now() + wait;

      setTimeout(() => {
        job().finally(() => {
          active -= 1;
          pump();
        });
      }, wait);
    }
  }

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push(() => fn().then(resolve, reject));
      pump();
    });
}

const limiters = Object.fromEntries(
  Object.entries(BUCKET_CONFIG).map(([name, cfg]) => [
    name,
    createLimiter(cfg),
  ]),
);

export function getCooldownSeconds(bucket) {
  const until = cooldownUntil.get(bucket) || 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function parseRetryAfter(header) {
  if (header == null || header === "") return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);

  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }

  return null;
}

function startCooldown(bucket, headerValue) {
  let seconds = parseRetryAfter(headerValue);

  if (seconds == null) {
    const count = (consecutive429.get(bucket) || 0) + 1;
    consecutive429.set(bucket, count);
    seconds =
      DEFAULT_BACKOFF_STEPS[
        Math.min(count - 1, DEFAULT_BACKOFF_STEPS.length - 1)
      ];
  }

  seconds = Math.min(Math.max(1, seconds), MAX_COOLDOWN_SECONDS);
  cooldownUntil.set(bucket, Date.now() + seconds * 1000);

  console.warn(
    `[spotify-http] 429 on "${bucket}" -> pausing requests for ${seconds}s`,
  );

  return seconds;
}

/*
 * fetch() wrapper. Throws SpotifyRateLimitError (status 429,
 * retryAfterSeconds) on a 429 AND immediately, without touching the
 * network, for as long as that bucket is cooling down.
 */
export function guardedFetch(bucket, url, options = {}) {
  const limiter = limiters[bucket];
  if (!limiter) throw new Error(`Unknown Spotify bucket "${bucket}"`);

  return limiter(async () => {
    const remaining = getCooldownSeconds(bucket);
    if (remaining > 0) throw new SpotifyRateLimitError(bucket, remaining);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...options,
    });

    if (response.status === 429) {
      const seconds = startCooldown(
        bucket,
        response.headers.get("retry-after"),
      );
      throw new SpotifyRateLimitError(bucket, seconds);
    }

    consecutive429.set(bucket, 0);
    return response;
  });
}

// Drop-in fetchImpl for the embed-page scraper.
export const embedFetch = (url, options) =>
  guardedFetch("embed", url, options);

/* ---------- single-flight ---------- */

const inflight = new Map();

export function singleFlight(key, fn) {
  if (inflight.has(key)) return inflight.get(key);

  const promise = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/* ---------- client-credentials token ---------- */

let tokenCache = null; // { token, expiresAt }
const TOKEN_SAFETY_MS = 60_000;

export async function getSpotifyToken() {
  if (tokenCache && tokenCache.expiresAt - TOKEN_SAFETY_MS > Date.now()) {
    return tokenCache.token;
  }

  return singleFlight("spotify-token", async () => {
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      throw new Error(
        "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not set",
      );
    }

    const response = await guardedFetch(
      "accounts",
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
            ).toString("base64"),
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
      },
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.access_token) {
      const error = new Error(
        data?.error_description || "failed to fetch token",
      );
      error.status = response.status;
      throw error;
    }

    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    };

    return tokenCache.token;
  });
}

// Call when the API answers 401 so the next call fetches a fresh token.
export function invalidateSpotifyToken() {
  tokenCache = null;
}

/* ---------- "official /v1/tracks is 403 for this app" memory ---------- */

/*
 * This app's credentials get a flat 403 from /v1/tracks. Instead of
 * burning a request on it before every embed scrape, remember it for a
 * while and go straight to the embed fallback.
 */
const OFFICIAL_TRACKS_RETRY_MS = 30 * 60 * 1000;
let officialTracksDisabledUntil = 0;

export function isOfficialTracksDisabled() {
  return Date.now() < officialTracksDisabledUntil;
}

export function disableOfficialTracks() {
  officialTracksDisabledUntil = Date.now() + OFFICIAL_TRACKS_RETRY_MS;
  console.warn(
    "[spotify-http] /v1/tracks returned 403; skipping it for 30 min (embed fallback only)",
  );
}

/* ---------- express helper ---------- */

export function sendSpotifyError(res, error, fallbackMessage) {
  if (error?.status === 429 || error?.rateLimited) {
    const retryAfterSeconds = Number.isFinite(error.retryAfterSeconds)
      ? error.retryAfterSeconds
      : 30;

    res.set("Retry-After", String(retryAfterSeconds));

    return res.status(429).json({
      message: "Spotify is rate-limiting requests. Please try again shortly.",
      rateLimited: true,
      retryAfterSeconds,
    });
  }

  const status =
    Number.isInteger(error?.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 502;

  return res.status(status).json({
    message: error?.message || fallbackMessage,
  });
}
