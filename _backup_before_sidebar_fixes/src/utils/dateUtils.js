export function formatRelativeDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown date";
  }

  const now = new Date();
  const diffMs = Math.max(
    0,
    now.getTime() - timestamp.getTime(),
  );

  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24 && timestamp.toDateString() === now.toDateString()) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (timestamp.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  const days = Math.floor(
    diffMs / (1000 * 60 * 60 * 24),
  );

  if (days < 7) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }

  const weeks = Math.floor(days / 7);

  if (weeks < 5) {
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }

  const months =
    (now.getFullYear() - timestamp.getFullYear()) * 12 +
    (now.getMonth() - timestamp.getMonth());

  if (months < 12) {
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }

  const years = now.getFullYear() - timestamp.getFullYear();

  if (years < 2) {
    return "1 year ago";
  }

  return `${years} years ago`;
}

export function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown date";
  }

  return timestamp.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
