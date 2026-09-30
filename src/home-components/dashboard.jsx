import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getImageUrl } from "../utils/imageUrl";
import { getRetryDelayMs } from "../utils/retryDelay.js";
import "../styling/dashboard.css";

function coverStyle(cover) {
  const url = getImageUrl(cover);
  return url ? { backgroundImage: `url(${url})` } : undefined;
}

function PlaylistTile({ playlist, subtitle, onClick, round }) {
  return (
    <button type="button" className="dashboard-tile" onClick={onClick}>
      <div
        className={`dashboard-tile-cover${round ? " round" : ""}`}
        style={coverStyle(playlist.cover)}
      >
        {!playlist.cover && (
          <span className="material-symbols-outlined">music_note</span>
        )}
      </div>

      <span className="dashboard-tile-name">{playlist.name}</span>
      <span className="dashboard-tile-subtitle">{subtitle}</span>
    </button>
  );
}

function ArtistTile({ artist, onClick }) {
  return (
    <button type="button" className="dashboard-tile" onClick={onClick}>
      <div className="dashboard-tile-cover round" style={coverStyle(artist.cover)}>
        {!artist.cover && (
          <span className="material-symbols-outlined">person</span>
        )}
      </div>

      <span className="dashboard-tile-name">{artist.name}</span>
      <span className="dashboard-tile-subtitle">
        {artist.songCount} {artist.songCount === 1 ? "song" : "songs"} in your library
      </span>
    </button>
  );
}

function DashboardRow({ title, onShowAll, children }) {
  return (
    <section className="dashboard-row">
      <div className="dashboard-row-heading">
        <h2>{title}</h2>
        {onShowAll && (
          <button type="button" className="dashboard-show-all" onClick={onShowAll}>
            Show all
          </button>
        )}
      </div>

      <div className="dashboard-tile-grid">{children}</div>
    </section>
  );
}

function Dashboard({ setSelectedPlaylist }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let retryTimeout = null;
    let retryCount = 0;
    const MAX_RETRIES = 6;

    async function loadDashboard() {
      if (cancelled) return;

      try {
        const response = await fetch("http://localhost:3000/home/dashboard", {
          credentials: "include",
        });

        const body = await response.json().catch(() => ({}));

        if (response.status === 429 && retryCount < MAX_RETRIES) {
          const delay = getRetryDelayMs(body.retryAfterSeconds, retryCount);
          retryCount += 1;
          retryTimeout = setTimeout(loadDashboard, delay);
          return;
        }

        if (!response.ok) {
          throw new Error(body.message || "Failed to load dashboard");
        }

        if (!cancelled) {
          setData(body);
          setLoading(false);
        }
      } catch (error) {
        console.error("FAILED TO LOAD DASHBOARD:", error);
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  function openPlaylist(playlist) {
    if (playlist.type === "spotify-public") {
      const spotifyId = String(playlist.id).replace(/^spotify:/, "");
      navigate(`/home?spotifyPlaylist=${encodeURIComponent(spotifyId)}`);
      return;
    }

    setSelectedPlaylist({
      id: playlist.id,
      name: playlist.name,
      owner: playlist.owner,
      cover: playlist.cover,
      type: "local",
    });
  }

  function openArtist(artist) {
    navigate(`/search?q=${encodeURIComponent(artist.name)}`);
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <span className="material-symbols-outlined">progress_activity</span>
        <p>Loading your home...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dashboard-loading">
        <p>Couldn't load your home right now.</p>
      </div>
    );
  }

  const {
    recents = [],
    oldest = [],
    newest = [],
    topArtists = [],
    worldwide,
    stations = [],
    hasAnyPlaylists,
  } = data;

  // With few playlists, "newest" and "oldest" overlap and the same
  // playlist showed up twice in the row.
  const newestIds = new Set(newest.map((playlist) => playlist.id));
  const oldestOnly = oldest.filter((playlist) => !newestIds.has(playlist.id));

  return (
    <div className="dashboard">
      {recents.length > 0 && (
        <DashboardRow title="Recents">
          {recents.map((playlist) => (
            <PlaylistTile
              key={`recent-${playlist.id}`}
              playlist={playlist}
              subtitle={
                playlist.type === "spotify-public"
                  ? `Playlist • ${playlist.owner || "Spotify"}`
                  : `Playlist • ${playlist.owner}`
              }
              onClick={() => openPlaylist(playlist)}
            />
          ))}
        </DashboardRow>
      )}

      {(oldestOnly.length > 0 || newest.length > 0) && (
        <DashboardRow title="From when you started">
          {newest.map((playlist) => (
            <PlaylistTile
              key={`newest-${playlist.id}`}
              playlist={playlist}
              subtitle="Newest playlist"
              onClick={() => openPlaylist(playlist)}
            />
          ))}

          {oldestOnly.map((playlist) => (
            <PlaylistTile
              key={`oldest-${playlist.id}`}
              playlist={playlist}
              subtitle="Oldest playlist"
              onClick={() => openPlaylist(playlist)}
            />
          ))}
        </DashboardRow>
      )}

      {topArtists.length > 0 && (
        <DashboardRow title="Your top artists">
          {topArtists.map((artist) => (
            <ArtistTile
              key={`artist-${artist.name}`}
              artist={artist}
              onClick={() => openArtist(artist)}
            />
          ))}
        </DashboardRow>
      )}

      {worldwide && (
        <DashboardRow title="Best of the world">
          <PlaylistTile
            playlist={worldwide}
            subtitle={
              Number.isFinite(worldwide.trackCount)
                ? `Top ${worldwide.trackCount} songs worldwide`
                : "Top songs worldwide"
            }
            onClick={() => openPlaylist({ ...worldwide, type: "spotify-public" })}
          />
        </DashboardRow>
      )}

      {stations.length > 0 && (
        <DashboardRow title="Popular stations">
          {stations.map((station) => (
            <PlaylistTile
              key={`station-${station.id}`}
              playlist={station}
              subtitle="Station • Spotify"
              onClick={() => openPlaylist({ ...station, type: "spotify-public" })}
            />
          ))}
        </DashboardRow>
      )}

      {!hasAnyPlaylists &&
        recents.length === 0 &&
        !worldwide &&
        stations.length === 0 && (
          <div className="dashboard-empty">
            <p>Create or save a playlist to see it here.</p>
          </div>
        )}
    </div>
  );
}

export default Dashboard;
