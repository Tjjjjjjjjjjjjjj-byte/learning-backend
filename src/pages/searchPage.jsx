import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Nav from "../home-components/nav";
import TrackCard from "../searchpagecomponents/Trackcard";
import AlbumCard from "../searchpagecomponents/AlbumCard";
import ArtistCard from "../searchpagecomponents/ArtistCard";
import { SEARCH_QUEUE_ID } from "../App";
import "../styling/search.css";

function SearchPage({ player }) {
  const [searchParams] = useSearchParams();
  const searchValue = searchParams.get("q") || "";

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const navigate = useNavigate();

  const {
    current,
    setCurrent,
    currentPlaylistId,
    setCurrentPlaylistId,
    isPlaying,
    setIsPlaying,
    setPlaybackTracks,
    setPlaybackPlaylistId,
  } = player;

  // Clicking play on a search result queues up the rest of the current
  // search results as the playback queue, so auto-next moves through
  // them the same way it moves through a real playlist.
  function playFromSearch(track) {
    if (current === track.id && currentPlaylistId === SEARCH_QUEUE_ID) {
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

      try {
        const response = await fetch(
          `http://localhost:3000/search?q=${encodeURIComponent(searchValue)}`,
          {
            credentials: "include",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Search failed");
        }

        setResults(data);
      } catch (error) {
        console.error(error);
        setResults(null);
      } finally {
        setLoading(false);
      }
    }

    getResults();
  }, [searchValue]);

  useEffect(() => {
    async function fetchPlaylists() {
      try {
        const response = await fetch("http://localhost:3000/home", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        setPlaylists(data.playlists || []);
      } catch (error) {
        console.error("Failed to load playlists:", error);
        setPlaylists([]);
      }
    }

    fetchPlaylists();
  }, []);

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

          {!loading && results && (
            <>
              {results.tracks?.items?.length > 0 && (
                <section className="search-section">
                  <h2>Songs</h2>
                  <div className="search-results">
                    {results.tracks.items.map((track) => (
                      <TrackCard
                        key={track.id}
                        track={track}
                        playlists={playlists}
                        isCurrentTrack={
                          current === track.id &&
                          currentPlaylistId === SEARCH_QUEUE_ID
                        }
                        isPlaying={isPlaying}
                        setIsPlaying={setIsPlaying}
                        onPlay={playFromSearch}
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

              {!results.tracks?.items?.length &&
                !results.artists?.items?.length &&
                !results.albums?.items?.length && <p>No results found.</p>}
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default SearchPage;