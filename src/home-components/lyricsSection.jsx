import { useEffect, useRef, useState } from "react";

const lyricsCache = new Map();

function LyricsSection({ currentTrack, currentTime }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);

  const lineRefs = useRef([]);

  useEffect(() => {
    const trackId = currentTrack?.id;

    setActiveLine(-1);
    lineRefs.current = [];

    if (!trackId) {
      setLines([]);
      setUnavailable(false);
      setLoading(false);
      return;
    }

    if (lyricsCache.has(trackId)) {
      const cachedLines = lyricsCache.get(trackId);

      setLines(cachedLines);
      setUnavailable(cachedLines.length === 0);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    setLines([]);
    setUnavailable(false);
    setLoading(true);

    async function loadLyrics() {
      try {
        const response = await fetch(
          `http://localhost:3000/lyrics/${encodeURIComponent(trackId)}`,
          {
            credentials: "include",
            signal: controller.signal,
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Lyrics unavailable",
          );
        }

        const apiLines = Array.isArray(data?.lyrics?.lines)
          ? data.lyrics.lines
          : [];

        const normalizedLines = apiLines
          .map((line) => ({
            startTimeMs: Number(line?.startTimeMs),
            words: String(line?.words || "").trim(),
          }))
          .filter(
            (line) =>
              Number.isFinite(line.startTimeMs) &&
              line.words,
          )
          .sort(
            (a, b) =>
              a.startTimeMs - b.startTimeMs,
          );

        lyricsCache.set(trackId, normalizedLines);

        if (controller.signal.aborted) return;

        setLines(normalizedLines);
        setUnavailable(normalizedLines.length === 0);
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        console.error("LYRICS LOAD ERROR:", error);

        if (!controller.signal.aborted) {
          lyricsCache.set(trackId, []);
          setLines([]);
          setUnavailable(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadLyrics();

    return () => controller.abort();
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!lines.length) {
      setActiveLine(-1);
      return;
    }

    const currentTimeMs = Math.max(
      0,
      Number(currentTime || 0) * 1000,
    );

    let nextActiveLine = 0;

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].startTimeMs <= currentTimeMs) {
        nextActiveLine = index;
      } else {
        break;
      }
    }

    setActiveLine(nextActiveLine);
  }, [currentTime, lines]);

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

        <span>
          {loading
            ? "Loading"
            : unavailable
              ? "Unavailable"
              : "Synced"}
        </span>
      </div>

      {loading ? (
        <div className="lyrics-placeholder">
          Loading lyrics...
        </div>
      ) : unavailable ? (
        <div className="lyrics-placeholder">
          Lyrics unavailable
        </div>
      ) : (
        <div className="lyrics-lines">
          {lines.map((line, index) => (
            <p
              key={`${line.startTimeMs}-${index}`}
              ref={(element) => {
                lineRefs.current[index] = element;
              }}
              className={
                index === activeLine
                  ? "lyrics-line active"
                  : "lyrics-line"
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
