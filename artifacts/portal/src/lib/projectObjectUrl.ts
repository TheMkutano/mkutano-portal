/** Private objects always carry the active convening scope on download. */
export function projectObjectUrl(url: string, conveningId: string | null | undefined): string {
  if (!url) return url;
  const path = url.startsWith("/objects/") ? `/api/storage${url}` : url;
  if (!path.startsWith("/api/storage/objects/")) return path;
  if (!conveningId) return "";
  const parsed = new URL(path, window.location.origin);
  parsed.searchParams.set("conveningId", conveningId);
  return `${parsed.pathname}${parsed.search}`;
}