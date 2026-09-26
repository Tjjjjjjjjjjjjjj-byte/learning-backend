import { getImageUrl } from "../utils/imageUrl";

function AlbumCard({ album }) {
  const href = album.external_urls?.spotify;

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
      <img src={getImageUrl(album.images?.[0]?.url)} alt={album.name} />
      <div className="search-result-info">
        <h3>{album.name}</h3>
        <p>{album.artists?.map((artist) => artist.name).join(", ")}</p>
        <p>Tracks: {album.total_tracks}</p>
      </div>
    </article>
  );
}

export default AlbumCard;
