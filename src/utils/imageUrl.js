const BACKEND_IMAGE_PROXY = "http://localhost:3000/image-proxy?url=";

export function getImageUrl(value) {
  if (typeof value !== "string") return "";

  const url = value.trim();
  if (!url) return "";

  if (/^(?:data:|blob:)/i.test(url)) return url;
  if (/^https?:\/\/localhost(?::\d+)?\//i.test(url)) return url;
  if (/^https?:\/\/127\.0\.0\.1(?::\d+)?\//i.test(url)) return url;

  if (/^https:\/\/(?:i\.scdn\.co|mosaic\.scdn\.co|images\.scdn\.co|image-cdn-fa\.spotifycdn\.com)\//i.test(url)) {
    return `${BACKEND_IMAGE_PROXY}${encodeURIComponent(url)}`;
  }

  return url;
}
