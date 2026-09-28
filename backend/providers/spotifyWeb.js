const SPOTIFY_EMBED_BASE = "https://open.spotify.com/embed";
const SPOTIFY_WEB_BASE = "https://open.spotify.com";
const DEFAULT_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values) {
  for (const value of values) {
    const string = asString(value);
    if (string) return string;
  }
  return "";
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

function parseDurationMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const text = asString(value);
  if (!text) return null;

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const number = Number(text);
    return Number.isFinite(number) ? Math.max(0, number) : null;
  }

  const parts = text.split(":").map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return Math.max(0, (parts[0] * 60 + parts[1]) * 1000);
  }

  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return Math.max(
      0,
      (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000,
    );
  }

  return null;
}

function parseTrackId(value) {
  const text = asString(value);
  if (!text) return "";

  const uriMatch = text.match(/^spotify:track:([A-Za-z0-9]{22})$/i);
  if (uriMatch) return uriMatch[1];

  const urlMatch = text.match(
    /(?:https?:\/\/open\.spotify\.com\/(?:embed\/)?track\/|spotify:track:)([A-Za-z0-9]{22})(?:[/?#].*)?$/i,
  );
  if (urlMatch) return urlMatch[1];

  if (/^[A-Za-z0-9]{22}$/.test(text)) return text;

  return "";
}

function normalizeArtistList(value) {
  if (Array.isArray(value)) {
    return value
      .map((artist) => {
        if (typeof artist === "string") return artist.trim();
        return firstString(artist?.name, artist?.title);
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\s*[·|,]\s*/)
      .map((artist) => artist.trim())
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    return normalizeArtistList(
      value.items || value.nodes || value.artists || value.name,
    );
  }

  return [];
}

function pickArtwork(value, fallback = "") {
  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickArtwork(item, fallback);
      if (picked) return picked;
    }
  }

  if (value && typeof value === "object") {
    return firstString(
      value.url,
      value.src,
      value.imageUrl,
      value.uri,
      pickArtwork(value.visualIdentity, ""),
      pickArtwork(value.sources, ""),
      pickArtwork(value.images, ""),
      pickArtwork(value.image, ""),
    );
  }

  return fallback;
}

function findTrackList(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value.trackList)) return value.trackList;

  if (Array.isArray(value.tracks) && value.tracks.length) {
    const looksLikeTracks = value.tracks.some(
      (item) =>
        item &&
        typeof item === "object" &&
        (item.uri ||
          item.trackUri ||
          item.title ||
          item.name ||
          item.track),
    );

    if (looksLikeTracks) return value.tracks;
  }

  for (const child of Object.values(value)) {
    const found = findTrackList(child, seen);
    if (found) return found;
  }

  return null;
}

function findPlaylistEntity(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  const type = asString(value.type).toLowerCase();

  if (
    type === "playlist" &&
    (value.trackList ||
      value.name ||
      value.title ||
      value.subtitle ||
      value.description)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findPlaylistEntity(child, seen);
    if (found) return found;
  }

  return null;
}

function findTrackEntity(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  const type = asString(value.type).toLowerCase();

  if (type === "track" && (value.name || value.title)) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findTrackEntity(child, seen);
    if (found) return found;
  }

  return null;
}

// Runs `fn` over `items` with at most `limit` in flight at once, instead of
// either a single fetch-per-item loop (slow, one at a time) or
// Promise.all over everything at once (looks like a burst/DoS to whatever
// we're fetching from).
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await fn(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}

/*
 * Fetches a single track's embed page and pulls its name/album/cover out of
 * the same __NEXT_DATA__ structure the playlist scraper reads. This exists
 * as a fallback for when Spotify's official Web API (GET /v1/tracks) is
 * unavailable for this app's credentials (HTTP 403) -- the embed pages
 * aren't gated behind that same restriction.
 */
async function resolveTrackViaEmbed(trackId, fetchImpl = fetch) {
  const id = String(trackId || "").trim();

  const response = await fetchImpl(
    `${SPOTIFY_EMBED_BASE}/track/${encodeURIComponent(id)}`,
    { headers: DEFAULT_HEADERS },
  );

  const html = await response.text();

  if (!response.ok) {
    const error = new Error(
      `Spotify embed track request failed with HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  const data = extractNextData(html);
  const pageArtwork = extractMetaContent(html, "og:image");
  const pageTitle = extractMetaContent(html, "og:title");
  const entity = data ? findTrackEntity(data) : null;

  const artwork =
    pickArtwork(entity?.visualIdentity, "") ||
    pickArtwork(entity?.images, "") ||
    pickArtwork(entity?.albumOfTrack?.visualIdentity, "") ||
    pickArtwork(entity?.albumOfTrack?.images, "") ||
    pickArtwork(entity?.album?.visualIdentity, "") ||
    pickArtwork(entity?.album?.images, "") ||
    pageArtwork ||
    "";

  const name = firstString(entity?.name, entity?.title, pageTitle);

  const artists = normalizeArtistList(
    entity?.artists || entity?.subtitle,
  );

  const albumName = firstString(
    entity?.albumOfTrack?.name,
    entity?.album?.name,
  );

  const durationMs =
    parseDurationMs(
      firstString(entity?.duration_ms, entity?.durationMs, entity?.duration),
    ) ??
    firstNumber(entity?.duration_ms, entity?.durationMs, entity?.duration) ??
    0;

  const externalUrl = `${SPOTIFY_WEB_BASE}/track/${id}`;

  return {
    id,
    name,
    artists: artists.map((artistName) => ({ name: artistName })),
    album: {
      name: albumName,
      images: artwork ? [{ url: artwork }] : [],
    },
    duration_ms: durationMs,
    external_urls: { spotify: externalUrl },
  };
}

function extractMetaContent(html, property) {
  const escaped = String(property).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
    "i",
  );
  return firstString(html.match(re1)?.[1], html.match(re2)?.[1]);
}

function extractNextData(html) {
  const match = String(html || "").match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );

  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/*
 * Deterministic, content-based fallback id for a track whose real Spotify
 * ID couldn't be extracted. Deliberately NOT based on array index/position:
 * an index-based id breaks the moment the same playlist gets re-fetched
 * and the array order shifts even slightly (which happens often now, given
 * how much retry logic exists around Spotify rate-limiting) -- the player
 * matches tracks purely by id, so a shifting id makes the now-playing bar
 * lose track of what's actually playing. Hashing the track's own content
 * keeps the same track's fallback id stable across re-fetches instead.
 */
function hashTrackContent(...parts) {
  const input = parts.filter(Boolean).join("|");
  let hash = 0;

  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }

  return `spotify-embed-${(hash >>> 0).toString(36)}`;
}

function normalizeEmbedTrack(raw, index, playlistArtwork = "") {
  if (!raw || typeof raw !== "object") return null;

  const uri = firstString(
    raw.uri,
    raw.trackUri,
    raw.spotifyUri,
    raw.track?.uri,
    raw.item?.uri,
  );

  const id = firstString(
    parseTrackId(uri),
    parseTrackId(raw.externalUrl),
    parseTrackId(raw.external_urls?.spotify),
    parseTrackId(raw.url),
    parseTrackId(raw.href),
    parseTrackId(raw.trackUrl),
    parseTrackId(raw.track?.uri),
    parseTrackId(raw.track?.externalUrl),
    parseTrackId(raw.track?.external_urls?.spotify),
    parseTrackId(raw.item?.uri),
    parseTrackId(raw.item?.externalUrl),
    parseTrackId(raw.item?.external_urls?.spotify),
    parseTrackId(raw.id),
    parseTrackId(raw.trackId),
    parseTrackId(raw.track?.id),
    parseTrackId(raw.item?.id),
  );

  const title = firstString(
    raw.title,
    raw.name,
    raw.track?.title,
    raw.track?.name,
    raw.item?.title,
    raw.item?.name,
  );

  if (!title) return null;

  const artists = normalizeArtistList(
    raw.artists ||
      raw.artist ||
      raw.subtitle ||
      raw.track?.artists ||
      raw.track?.artist ||
      raw.item?.artists ||
      raw.item?.artist,
  );

  const albumObject =
    raw.album ||
    raw.track?.album ||
    raw.item?.album ||
    {};

  const album = firstString(
    typeof albumObject === "string" ? albumObject : "",
    albumObject.name,
    albumObject.title,
    raw.albumName,
    raw.track?.albumName,
  );

  const durationMs =
    parseDurationMs(
      firstString(
        raw.duration_ms,
        raw.durationMs,
        raw.duration,
        raw.track?.duration_ms,
        raw.track?.durationMs,
        raw.item?.duration_ms,
        raw.item?.durationMs,
      ),
    ) ??
    firstNumber(
      raw.duration_ms,
      raw.durationMs,
      raw.duration,
      raw.track?.duration_ms,
      raw.track?.durationMs,
      raw.item?.duration_ms,
      raw.item?.durationMs,
    );

  const artwork =
    pickArtwork(raw.visualIdentity, "") ||
    pickArtwork(raw.artwork, "") ||
    pickArtwork(raw.image, "") ||
    pickArtwork(raw.images, "") ||
    pickArtwork(raw.albumArt, "") ||
    pickArtwork(raw.coverArt, "") ||
    pickArtwork(albumObject?.visualIdentity, "") ||
    pickArtwork(albumObject?.images, "") ||
    pickArtwork(albumObject?.coverArt, "") ||
    pickArtwork(raw.track?.images, "") ||
    pickArtwork(raw.track?.album?.images, "") ||
    pickArtwork(raw.track?.album?.coverArt, "") ||
    pickArtwork(raw.item?.images, "") ||
    pickArtwork(raw.item?.album?.images, "") ||
    pickArtwork(raw.item?.album?.coverArt, "") ||
    playlistArtwork ||
    "";

  const externalUrl =
    firstString(
      raw.externalUrl,
      raw.external_urls?.spotify,
      raw.track?.external_urls?.spotify,
      raw.item?.external_urls?.spotify,
    ) ||
    (id ? `https://open.spotify.com/track/${id}` : "");

  const fallbackId =
    id || hashTrackContent(title, artists.join(","), album, String(index));

  return {
    id: id || fallbackId,
    name: title,
    title,
    artists: artists.map((name) => ({ name })),
    artist: artists.join(", "),
    album: {
      name: album,
      images: artwork ? [{ url: artwork }] : [],
    },
    duration_ms: durationMs ?? 0,
    artwork,
    externalUrl,
    uri: uri || (id ? `spotify:track:${id}` : ""),
    source: "spotify-web",
    provider: "spotify-web",
    providerTrackId: id || null,
    sourceUrl: externalUrl,
    spotifyTrackId: id || null,
    isrc: firstString(
      raw.isrc,
      raw.externalIds?.isrc,
      raw.external_ids?.isrc,
      raw.track?.external_ids?.isrc,
    ) || null,
    playlistIndex: index,
  };
}

function parseEmbedPlaylist(html, playlistId) {
  const data = extractNextData(html);
  const pageArtwork = extractMetaContent(html, "og:image");
  const pageTitle = extractMetaContent(html, "og:title");
  const pageDescription = extractMetaContent(html, "og:description");

  if (!data) {
    const error = new Error(
      "Spotify embed page did not contain its playlist data",
    );
    error.code = "SPOTIFY_EMBED_NO_NEXT_DATA";
    throw error;
  }

  const entity = findPlaylistEntity(data);
  const rawTracks = findTrackList(data) || [];

  const playlistArtwork =
    pickArtwork(entity?.visualIdentity, "") ||
    pickArtwork(entity?.images, "") ||
    pickArtwork(entity?.image, "") ||
    pickArtwork(entity?.cover, "") ||
    pickArtwork(entity?.coverArt, "") ||
    pickArtwork(entity?.artwork, "") ||
    pageArtwork ||
    "";

  const tracks = rawTracks
    .map((track, index) =>
      normalizeEmbedTrack(track, index, playlistArtwork),
    )
    .filter(Boolean);

  const owner =
    firstString(
      entity?.subtitle,
      entity?.owner?.display_name,
      entity?.owner?.name,
      entity?.owner?.id,
    ) || "Spotify";

  const name =
    firstString(entity?.name, entity?.title, pageTitle) || "Spotify Playlist";

  const description = firstString(
    entity?.description,
    entity?.subtitleDescription,
    pageDescription,
  );

  const reportedTrackCount = firstNumber(
    entity?.trackCount,
    entity?.tracks?.total,
    entity?.totalTracks,
  );

  const trackCount =
    tracks.length > 0 && (reportedTrackCount == null || reportedTrackCount === 0)
      ? tracks.length
      : reportedTrackCount;

  return {
    playlistId,
    name,
    owner,
    description,
    cover: playlistArtwork,
    trackCount,
    tracks,
    source: "spotify-web",
    sourceUrl: `https://open.spotify.com/playlist/${playlistId}`,
    embedUrl: `${SPOTIFY_EMBED_BASE}/playlist/${playlistId}`,
  };
}

export function createSpotifyWebProvider({ fetchImpl = fetch } = {}) {
  return {
    id: "spotify-web",
    name: "Spotify Web",
    capabilities: {
      playlist: true,
      track: true,
      search: false,
    },

    canHandle(value) {
      return Boolean(
        String(value || "").match(
          /(?:open\.spotify\.com\/(?:embed\/)?playlist\/|spotify:playlist:)/i,
        ),
      );
    },

    async resolvePlaylist(playlistId) {
      const id = String(playlistId || "").trim();

      if (!/^[A-Za-z0-9]+$/.test(id)) {
        const error = new Error("Invalid Spotify playlist ID");
        error.status = 400;
        throw error;
      }

      const response = await fetchImpl(
        `${SPOTIFY_EMBED_BASE}/playlist/${encodeURIComponent(id)}`,
        {
          headers: DEFAULT_HEADERS,
        },
      );

      const html = await response.text();

      if (!response.ok) {
        const error = new Error(
          `Spotify embed playlist request failed with HTTP ${response.status}`,
        );
        error.status = response.status;
        throw error;
      }

      const result = parseEmbedPlaylist(html, id);

      // Playlists with no custom cover get a mosaic image generated from
      // their tracks -- that mosaic is reliably present as og:image on the
      // plain (non-embed) playlist page, but is sometimes missing from the
      // embed page's own metadata/__NEXT_DATA__. Fall back to it when the
      // embed page gave us nothing.
      if (!result.cover) {
        try {
          const plainResponse = await fetchImpl(
            `${SPOTIFY_WEB_BASE}/playlist/${encodeURIComponent(id)}`,
            { headers: DEFAULT_HEADERS },
          );

          if (plainResponse.ok) {
            const plainHtml = await plainResponse.text();
            const fallbackCover = extractMetaContent(plainHtml, "og:image");

            if (fallbackCover) {
              console.log(
                "[spotify-web] used plain-page og:image fallback for cover",
              );
              result.cover = fallbackCover;
            }
          }
        } catch (error) {
          console.error(
            "[spotify-web] plain-page cover fallback failed:",
            error,
          );
        }
      }

      return result;
    },
  };
}

export { parseEmbedPlaylist, resolveTrackViaEmbed, mapWithConcurrency };