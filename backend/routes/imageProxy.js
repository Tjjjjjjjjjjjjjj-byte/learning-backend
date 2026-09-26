const ALLOWED_HOSTS = new Set([
  "i.scdn.co",
  "mosaic.scdn.co",
  "image-cdn-fa.spotifycdn.com",
  "images.scdn.co",
]);

function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function registerRoutes(app) {
  app.get("/image-proxy", async (req, res) => {
    const source = String(req.query.url || "").trim();

    if (!isAllowedImageUrl(source)) {
      return res.status(400).json({ message: "Unsupported image URL" });
    }

    try {
      const response = await fetch(source, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        return res.status(response.status).end();
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        return res.status(415).end();
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      res.set("X-Content-Type-Options", "nosniff");

      return res.send(buffer);
    } catch (error) {
      console.error("IMAGE PROXY ERROR:", error);
      return res.status(502).end();
    }
  });
}
