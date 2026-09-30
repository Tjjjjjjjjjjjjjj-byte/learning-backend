import {
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getRetryDelayMs } from "../utils/retryDelay.js";
import { waitForSpotifyReady } from "../utils/spotifyGate.js";
import Nav from "../home-components/nav";
import TrackCard from "../searchpagecomponents/Trackcard";
import AlbumCard from "../searchpagecomponents/AlbumCard";
import ArtistCard from "../searchpagecomponents/ArtistCard";
import PublicPlaylistCard from "../searchpagecomponents/PublicPlaylistCard";
import TopResultCard from "../searchpagecomponents/TopResultCard";
import { SEARCH_QUEUE_ID } from "../App";
import "../styling/search.css";

const RESULT_FILTERS = [
  { id: "all", label: "All" },
  { id: "playlist", label: "Playlists" },
  { id: "track", label: "Songs" },
  { id: "artist", label: "Artists" },
  { id: "album", label: "Albums" },
];

// One combined, interleaved feed instead of separate "Songs" / "Artists" /
// "Albums" sections -- each round takes one item per type, in this order.
const COMBINE_ORDER = ["track", "playlist", "album", "artist"];

function interleaveResults(byType) {
  const combined = [];
  const maxLength = Math.max(
    0,
    ...COMBINE_ORDER.map((type) => byType[type]?.length || 0),
  );

  for (let index = 0; index < maxLength; index += 1) {
    for (const type of COMBINE_ORDER) {
      const item = byType[type]?.[index];
      if (item) combined.push({ type, item });
    }
  }

  return combined;
}

// Spotify's search endpoint ranks each result type independently and gives
// no single cross-type relevance score, so the "top result" hero card is a
// heuristic: prefer an exact/prefix name match, then a per-type weight
// (artists and playlists tend to be what people are looking for by name),
// then popularity as a tiebreaker.
const TOP_RESULT_TYPE_WEIGHT = { artist: 30, playlist: 22, album: 14, track: 8 };

function scoreTopResultCandidate(item, type, query) {
  const name = String(item?.name || "").toLowerCase();
  const q = query.trim().toLowerCase();

  let score = TOP_RESULT_TYPE_WEIGHT[type] || 0;

  if (name === q) score += 100;
  else if (name.startsWith(q)) score += 55;
  else if (name.includes(q)) score += 25;

  const popularity = Number(item?.popularity);
  if (Number.isFinite(popularity)) score += popularity / 10;

  return score;
}

function pickTopResult(byType, query) {
  let best = null;

  for (const type of COMBINE_ORDER) {
    const item = byType[type]?.[0];
    if (!item) continue;

    const score = scoreTopResultCandidate(item, type, query);
    if (!best || score > best.score) best = { type, item, score };
  }

  return best;
}

function resultSubtitle(item, type) {
  if (type === "track" || type === "album") {
    return item.artists?.map((artist) => artist.name).filter(Boolean).join(", ");
  }

  if (type === "playlist") return item.owner;

  return "";
}

function resultCover(item, type) {
  if (type === "playlist") return item.cover;
  return item.images?.[0]?.url || item.album?.images?.[0]?.url;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!text) return {};

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      response.ok
        ? "Server returned a non-JSON response"
        : `Server returned HTTP ${response.status} instead of JSON`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Server returned invalid JSON");
  }
}

function SearchPage({ player }) {
  const [searchParams] = useSearchParams();
  const searchValue = searchParams.get("q") || "";

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [savingPlaylistId, setSavingPlaylistId] = useState(null);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const navigate = useNavigate();

  const {
    current,
    currentPlaylistId,
    isPlaying,
    setIsPlaying,
    setPlaybackTracks,
    setPlaybackPlaylistId,
    setCurrentPlaylistId,
    setCurrent,
    addToQueue,
    playNext,
  } = player;

  async function playFromSearch(track) {
    if (
      current === track.id &&
      currentPlaylistId === SEARCH_QUEUE_ID
    ) {
      setIsPlaying(!isPlaying);
      return;
    }

    // Wait (with the spinner on the track card) while Spotify is rate
    // limiting us and this track isn't cached; downloaded files skip it.
    if (!track.downloaded) {
      const ok = await waitForSpotifyReady(track.id);
      if (!ok) return; // superseded by a newer click
    }

    const queue = results?.tracks?.items || [];

    setPlaybackTracks(queue);
    setPlaybackPlaylistId(SEARCH_QUEUE_ID);
    setCurrentPlaylistId(SEARCH_QUEUE_ID);
    setCurrent(track.id);
    setIsPlaying(true);
  }

  useEffect(() => {
    async function checkLogIn() {
      try {
        const response = await fetch("http://localhost:3000/me", {
          credentials: "include",
        });

        if (response.status !== 200) {
          navigate("/login", { replace: true });
        }
      } catch (error) {
        console.error("Session check failed:", error);
      }
    }

    checkLogIn();
  }, [navigate]);

  useEffect(() => {
    if (!searchValue.trim()) {
      setResults(null);
      return;
    }

    let cancelled = false;
    let retryTimeout = null;
    let retryCount = 0;
    const MAX_RETRIES = 6;

    async function getResults() {
      if (cancelled) return;

      setLoading(true);
      setError("");

      try {
        const trimmedSearch = searchValue.trim();
        const playlistMatch = trimmedSearch.match(
          /^https?:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)(?:[/?#].*)?$/i,
        );

        const requestUrl = playlistMatch
          ? `http://localhost:3000/spotify/playlist/${encodeURIComponent(
              playlistMatch[1],
            )}`
          : `http://localhost:3000/search?q=${encodeURIComponent(trimmedSearch)}`;

        const response = await fetch(requestUrl, {
          credentials: "include",
        });

        const data = await readJsonResponse(response);

        if (response.status === 429 && retryCount < MAX_RETRIES) {
          if (cancelled) return;
          const delay = getRetryDelayMs(data.retryAfterSeconds, retryCount);
          retryCount += 1;
          retryTimeout = setTimeout(getResults, delay);
          return;
        }

        if (!response.ok) {
          throw new Error(data.message || `Search failed (HTTP ${response.status})`);
        }

        if (cancelled) return;

        if (playlistMatch && data?.type === "spotify-public") {
          const playlistTracks = Array.isArray(data.tracks) ? data.tracks : [];

          /*
           * "unavailable"/"metadata-only" mean Spotify is currently
           * rate-limiting or restricting the item lookup -- transient,
           * not a genuinely empty playlist. Quietly retry a few times
           * in the background, staying on the loading state, instead of
           * showing "0 songs" for something that might resolve seconds
           * later.
           */
          const status = data.itemsStatus || "unavailable";
          const isTransient =
            playlistTracks.length === 0 &&
            (status === "unavailable" || status === "metadata-only") &&
            retryCount < MAX_RETRIES;

          if (isTransient) {
            const delay = getRetryDelayMs(null, retryCount);
            retryCount += 1;
            retryTimeout = setTimeout(getResults, delay);
            return;
          }

          setResults({
            playlist: data,
            tracks: { items: playlistTracks },
            artists: { items: [] },
            albums: { items: [] },
          });
          setLoading(false);
          return;
        }

        setResults(data);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;

        console.error(error);
        setError(error.message || "Search failed");
        setResults(null);
        setLoading(false);
      }
    }

    getResults();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [searchValue]);

  useEffect(() => {
    setActiveFilter("all");
  }, [searchValue]);

  async function fetchPlaylists() {
    try {
      const response = await fetch("http://localhost:3000/home", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await readJsonResponse(response);
      setPlaylists(data.playlists || []);
    } catch (error) {
      console.error("Failed to load playlists:", error);
      setPlaylists([]);
    }
  }

  useEffect(() => {
    fetchPlaylists();
  }, []);

  async function savePublicPlaylist(playlist) {
    if (!playlist?.spotifyPlaylistId || savingPlaylistId) return;

    const alreadySaved = playlists.some(
      (item) =>
        item.importedSpotifyPlaylistId === playlist.spotifyPlaylistId ||
        (item.type === "spotify-public" &&
          item.spotifyPlaylistId === playlist.spotifyPlaylistId),
    );

    if (alreadySaved) return;

    setSavingPlaylistId(playlist.spotifyPlaylistId);

    try {
      const response = await fetch(
        `http://localhost:3000/spotify/playlist/${encodeURIComponent(
          playlist.spotifyPlaylistId,
        )}/save`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        },
      );

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || "Failed to save playlist");
      }

      await fetchPlaylists();
    } catch (error) {
      console.error("SAVE PUBLIC PLAYLIST ERROR:", error);
    } finally {
      setSavingPlaylistId(null);
    }
  }

  function openPublicPlaylist(playlist) {
    navigate(
      `/home?spotifyPlaylist=${encodeURIComponent(
        playlist.spotifyPlaylistId,
      )}`,
    );
  }

  const publicPlaylist = results?.playlist;
  const publicPlaylistSaved = publicPlaylist
    ? playlists.some(
        (item) =>
          item.importedSpotifyPlaylistId === publicPlaylist.spotifyPlaylistId ||
          (item.type === "spotify-public" &&
            item.spotifyPlaylistId === publicPlaylist.spotifyPlaylistId),
      )
    : false;

  function isPlaylistSaved(playlist) {
    return playlists.some(
      (item) =>
        item.importedSpotifyPlaylistId === playlist.spotifyPlaylistId ||
        (item.type === "spotify-public" &&
          item.spotifyPlaylistId === playlist.spotifyPlaylistId),
    );
  }

  // A direct playlist-URL paste (handled above via `publicPlaylist`) is its
  // own single-playlist view. Everything else -- an ordinary text search --
  // combines every result type into one feed instead of separate sections.
  const byType = useMemo(
    () => ({
      track: results?.tracks?.items || [],
      artist: results?.artists?.items || [],
      album: results?.albums?.items || [],
      playlist: results?.playlists?.items || [],
    }),
    [results],
  );

  const hasNormalResults = COMBINE_ORDER.some((type) => byType[type].length > 0);

  const topResult = useMemo(
    () => (hasNormalResults ? pickTopResult(byType, searchValue) : null),
    [byType, hasNormalResults, searchValue],
  );

  const combinedResults = useMemo(
    () => interleaveResults(byType),
    [byType],
  );

  const visibleResults =
    activeFilter === "all"
      ? combinedResults
      : combinedResults.filter((entry) => entry.type === activeFilter);

  function openExternal(url) {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function topResultAction() {
    if (!topResult) return;

    if (topResult.type === "track") {
      playFromSearch(topResult.item);
    } else if (topResult.type === "playlist") {
      openPublicPlaylist(topResult.item);
    } else {
      openExternal(topResult.item.external_urls?.spotify);
    }
  }

  function renderResultItem({ type, item }, key) {
    if (type === "track") {
      return (
        <TrackCard
          key={key}
          track={item}
          playlists={playlists}
          isCurrentTrack={
            current === item.id && currentPlaylistId === SEARCH_QUEUE_ID
          }
          isPlaying={isPlaying}
          onPlay={playFromSearch}
          onAddToQueue={addToQueue}
          onPlayNext={playNext}
        />
      );
    }

    if (type === "artist") {
      return <ArtistCard key={key} artist={item} />;
    }

    if (type === "album") {
      return <AlbumCard key={key} album={item} />;
    }

    return (
      <PublicPlaylistCard
        key={key}
        playlist={item}
        saved={isPlaylistSaved(item)}
        saving={savingPlaylistId === item.spotifyPlaylistId}
        onOpen={() => openPublicPlaylist(item)}
        onSave={() => savePublicPlaylist(item)}
      />
    );
  }

  return (
    <>
      <Nav />

      <main className="search-page">
        <div className="search-page-content">
          <h1>
            {searchValue
              ? `Search results for "${searchValue}"`
              : "Search for something to play"}
          </h1>

          {loading && <p>Loading...</p>}

          {!loading && error && (
            <section className="search-section">
              <p className="search-error">{error}</p>
            </section>
          )}

          {!loading && results && (
            <>
              {publicPlaylist && (
                <section className="search-section">
                  <h2>Playlist</h2>

                  <div className="search-results">
                    <PublicPlaylistCard
                      playlist={publicPlaylist}
                      saved={publicPlaylistSaved}
                      saving={
                        savingPlaylistId ===
                        publicPlaylist.spotifyPlaylistId
                      }
                      onOpen={() => openPublicPlaylist(publicPlaylist)}
                      onSave={() => savePublicPlaylist(publicPlaylist)}
                    />
                  </div>

                  {publicPlaylist.itemsStatus === "unavailable" && (
                    <p className="search-error">
                      Spotify provided the playlist metadata, but its song items are unavailable to this API client. This is not an empty playlist.
                    </p>
                  )}

                  {publicPlaylist.itemsStatus === "empty" && (
                    <p>No songs are available in this Spotify playlist.</p>
                  )}
                </section>
              )}

              {!publicPlaylist && hasNormalResults && (
                <>
                  <div className="search-filter-pills">
                    {RESULT_FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        className={`search-filter-pill${
                          activeFilter === filter.id ? " active" : ""
                        }`}
                        onClick={() => setActiveFilter(filter.id)}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  {activeFilter === "all" && topResult && (
                    <section className="search-section top-result-section">
                      <h2>Top result</h2>

                      <TopResultCard
                        item={topResult.item}
                        type={topResult.type}
                        subtitle={resultSubtitle(topResult.item, topResult.type)}
                        cover={resultCover(topResult.item, topResult.type)}
                        isCurrentTrack={
                          topResult.type === "track" &&
                          current === topResult.item.id &&
                          currentPlaylistId === SEARCH_QUEUE_ID
                        }
                        isPlaying={isPlaying}
                        onOpen={topResultAction}
                      />
                    </section>
                  )}

                  <section className="search-section">
                    <div className="search-results">
                      {visibleResults.map((entry) =>
                        renderResultItem(entry, `${entry.type}-${entry.item.id}`),
                      )}
                    </div>
                  </section>
                </>
              )}

              {!publicPlaylist && !hasNormalResults && (
                <p>No results found.</p>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default SearchPage;