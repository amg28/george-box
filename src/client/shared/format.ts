export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatTimer(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1_000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function capitalizeWords(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function normalizeRoomCode(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeDisplayName(value: string): string {
  return value.trim().slice(0, 24);
}
