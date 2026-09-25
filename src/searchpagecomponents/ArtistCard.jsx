function ArtistCard({ artist }) {
  const href = artist.external_urls?.spotify;

  return (
    <article
      className="search-result-card clickable-search-result"
      onClick={() => href && window.open(href, "_blank", "noopener,noreferrer")}
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      onKeyDown={(event) => {
        if (href && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }}
    >
      <img src={artist.images?.[0]?.url} alt={artist.name} />
      <div className="search-result-info">
        <h3>{artist.name}</h3>
      </div>
    </article>
  );
}

export default ArtistCard;
