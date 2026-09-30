import { useCallback, useEffect, useState } from "react";
import { STAT_RANGES, getListeningStats } from "../services/profileApi";
import { getImageUrl } from "../utils/imageUrl";
import { formatCount, formatMinutes } from "../utils/formatStats";

function StatTile({ icon, label, value }) {
  return (
    <div className="profile-stat-tile">
      <span className="material-symbols-outlined">{icon}</span>
      <strong>{value}</strong>
      <span className="profile-stat-label">{label}</span>
    </div>
  );
}

function Thumb({ src, fallbackIcon, round }) {
  const url = getImageUrl(src);

  return (
    <div className={`profile-thumb${round ? " round" : ""}`}>
      {url ? (
        <img src={url} alt="" />
      ) : (
        <span className="material-symbols-outlined">{fallbackIcon}</span>
      )}
    </div>
  );
}

function ActivityChart({ activity }) {
  const max = Math.max(1, ...activity.map((item) => item.minutes));

  return (
    <div className="profile-chart" role="img" aria-label="Listening time per period">
      {activity.map((item) => (
        <div
          className="profile-chart-col"
          key={item.label}
          title={`${item.label}: ${formatMinutes(item.minutes)}`}
        >
          <div className="profile-chart-track">
            <div
              className="profile-chart-bar"
              style={{ height: `${Math.max(4, (item.minutes / max) * 100)}%` }}
            />
          </div>
          <span className="profile-chart-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ListeningStats() {
  const [range, setRange] = useState("week");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextRange, isCancelled = () => false) => {
    setLoading(true);
    setError("");

    try {
      const data = await getListeningStats(nextRange);
      if (!isCancelled()) setStats(data);
    } catch (err) {
      if (!isCancelled()) setError(err.message || "Couldn't load your stats.");
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(range, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [range, load]);

  const totals = stats?.totals;
  const topArtists = stats?.topArtists || [];
  const topTracks = stats?.topTracks || [];

  return (
    <section className="profile-section" aria-labelledby="stats-heading">
      <div className="profile-section-heading">
        <h2 id="stats-heading">Listening stats</h2>

        <div className="profile-range" role="tablist" aria-label="Time range">
          {STAT_RANGES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={range === option.id}
              className={range === option.id ? "profile-range-btn active" : "profile-range-btn"}
              onClick={() => setRange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="profile-stats-state" role="alert">
          <p>{error}</p>
          <button type="button" className="profile-btn" onClick={() => load(range)}>
            Try again
          </button>
        </div>
      )}

      {!error && !stats && loading && (
        <div className="profile-stats-state">
          <span className="material-symbols-outlined profile-spin">progress_activity</span>
          <p>Loading your stats...</p>
        </div>
      )}

      {!error && stats && (
        <div className={loading ? "profile-stats refreshing" : "profile-stats"}>
          <div className="profile-stat-tiles">
            <StatTile icon="schedule" label="Time listened" value={formatMinutes(totals.minutesListened)} />
            <StatTile icon="music_note" label="Songs played" value={formatCount(totals.tracksPlayed)} />
            <StatTile icon="mic" label="Artists" value={formatCount(totals.uniqueArtists)} />
            <StatTile icon="local_fire_department" label="Day streak" value={formatCount(totals.streakDays)} />
          </div>

          <div className="profile-stats-panel">
            <h3>Activity</h3>
            <ActivityChart activity={stats.activity || []} />
          </div>

          <div className="profile-stats-columns">
            <div className="profile-stats-panel">
              <h3>Top artists</h3>

              {topArtists.length === 0 ? (
                <p className="profile-empty">Nothing here yet.</p>
              ) : (
                <ol className="profile-ranking">
                  {topArtists.map((artist, index) => (
                    <li key={artist.name}>
                      <span className="profile-rank">{index + 1}</span>
                      <Thumb src={artist.image} fallbackIcon="person" round />
                      <div className="profile-ranking-text">
                        <strong>{artist.name}</strong>
                        <span>{formatCount(artist.plays)} plays</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="profile-stats-panel">
              <h3>Top songs</h3>

              {topTracks.length === 0 ? (
                <p className="profile-empty">Nothing here yet.</p>
              ) : (
                <ol className="profile-ranking">
                  {topTracks.map((track, index) => (
                    <li key={track.id}>
                      <span className="profile-rank">{index + 1}</span>
                      <Thumb src={track.artwork} fallbackIcon="music_note" />
                      <div className="profile-ranking-text">
                        <strong>{track.title}</strong>
                        <span>
                          {track.artist} · {formatCount(track.plays)} plays
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ListeningStats;
