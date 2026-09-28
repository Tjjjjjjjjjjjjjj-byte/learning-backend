/*
 * How long to wait before retrying a rate-limited request.
 * Honours the server's retryAfterSeconds (which comes from Spotify's
 * Retry-After header) and otherwise backs off exponentially, with jitter so
 * several components don't all retry at the same instant.
 */
export function getRetryDelayMs(retryAfterSeconds, attempt) {
  const hinted = Number(retryAfterSeconds);
  const base =
    Number.isFinite(hinted) && hinted > 0
      ? hinted * 1000
      : Math.min(5000 * 2 ** attempt, 60000);

  const jitter = Math.random() * 1000;

  return Math.min(base + jitter, 120000);
}
