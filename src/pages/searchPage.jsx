import {
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import Nav from "../home-components/nav";
import TrackCard from "../searchpagecomponents/Trackcard";
import AlbumCard from "../searchpagecomponents/AlbumCard";
import ArtistCard from "../searchpagecomponents/ArtistCard";
import PublicPlaylistCard from "../searchpagecomponents/PublicPlaylistCard";
import { SEARCH_QUEUE_ID } from "../App";
import "../styling/search.css";

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

  function playFromSearch(track) {
    if (
      current === track.id &&
      currentPlaylistId === SEARCH_QUEUE_ID
    ) {
      setIsPlaying(!isPlaying);
      return;
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

    async function getResults() {
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

        if (!response.ok) {
          throw new Error(data.message || `Search failed (HTTP ${response.status})`);
        }

        if (playlistMatch && data?.type === "spotify-public") {
          const playlistTracks = Array.isArray(data.tracks) ? data.tracks : [];
          setResults({
            playlist: data,
            tracks: { items: playlistTracks },
            artists: { items: [] },
            albums: { items: [] },
          });
          return;
        }

        setResults(data);
      } catch (error) {
        console.error(error);
        setError(error.message || "Search failed");
        setResults(null);
      } finally {
        setLoading(false);
      }
    }

    getResults();
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
        item.type === "spotify-public" &&
        item.spotifyPlaylistId === playlist.spotifyPlaylistId,
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
          item.type === "spotify-public" &&
          item.spotifyPlaylistId === publicPlaylist.spotifyPlaylistId,
      )
    : false;

  const hasNormalResults =
    results?.tracks?.items?.length ||
    results?.artists?.items?.length ||
    results?.albums?.items?.length;

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

              {results.tracks?.items?.length > 0 && (
                <section className="search-section">
                  <h2>Songs</h2>

                  <div className="search-results">
                    {results.tracks.items.map((track, index) => (
                      <TrackCard
                        key={`${track.id}-${index}`}
                        track={track}
                        playlists={playlists}
                        isCurrentTrack={
                          current === track.id &&
                          currentPlaylistId === SEARCH_QUEUE_ID
                        }
                        isPlaying={isPlaying}
                        onPlay={playFromSearch}
                        onAddToQueue={addToQueue}
                        onPlayNext={playNext}
                      />
                    ))}
                  </div>
                </section>
              )}

              {results.artists?.items?.length > 0 && (
                <section className="search-section">
                  <h2>Artists</h2>

                  <div className="search-results">
                    {results.artists.items.map((artist) => (
                      <ArtistCard key={artist.id} artist={artist} />
                    ))}
                  </div>
                </section>
              )}

              {results.albums?.items?.length > 0 && (
                <section className="search-section">
                  <h2>Albums</h2>

                  <div className="search-results">
                    {results.albums.items.map((album) => (
                      <AlbumCard key={album.id} album={album} />
                    ))}
                  </div>
                </section>
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
