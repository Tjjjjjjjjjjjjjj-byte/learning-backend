import { useEffect, useRef } from "react";
import { useLyrics } from "../utils/useLyrics.js";

function LyricsSection({ currentTrack, currentTime, onExpand }) {
  const { lines, loading, unavailable, activeLine } = useLyrics(
    currentTrack,
    currentTime,
  );

  const lineRefs = useRef([]);

  useEffect(() => {
    lineRefs.current = [];
  }, [currentTrack?.id]);

  useEffect(() => {
    if (activeLine < 0) return;

    lineRefs.current[activeLine]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeLine]);

  return (
    <section className="lyrics-section">
      <div className="lyrics-section-heading">
        <span>LYRICS</span>

        <div className="lyrics-section-heading-right">
          <span>
            {loading ? "Loading" : unavailable ? "Unavailable" : "Synced"}
          </span>

          {onExpand && !unavailable && lines.length > 0 && (
            <button
              type="button"
              className="lyrics-expand-button"
              onClick={onExpand}
              title="Open fullscreen lyrics"
            >
              <span className="material-symbols-outlined">open_in_full</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="lyrics-placeholder">Loading lyrics...</div>
      ) : unavailable ? (
        <div className="lyrics-placeholder">Lyrics unavailable</div>
      ) : (
        <div className="lyrics-lines">
          {lines.map((line, index) => (
            <p
              key={`${line.startTimeMs}-${index}`}
              ref={(element) => {
                lineRefs.current[index] = element;
              }}
              className={
                index === activeLine ? "lyrics-line active" : "lyrics-line"
              }
            >
              {line.words}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

export default LyricsSection;
