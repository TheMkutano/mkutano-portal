/** Reject missing, conflicting or malformed project scopes before accessing rows. */
export function resolveProjectId(queryId: unknown, bodyId: unknown):
  | { id: string }
  | { error: string; status: 400 | 422 } {
  if (queryId !== undefined && bodyId !== undefined && queryId !== bodyId) {
    return { status: 400, error: "Conflicting conveningId values across request" };
  }
  const id = bodyId ?? queryId;
  if (typeof id !== "string" || !id.trim()) {
    return { status: 422, error: "conveningId is required" };
  }
  return { id };
}

/** An unscoped legacy row must never be writable from an event context. */
export function belongsToProject(row: { conveningId: string | null } | undefined, conveningId: string): boolean {
  return !!row && row.conveningId === conveningId;
}

/** Namespaced uploads cannot be read through another project's scope. Legacy paths still require a DB reference. */
export function objectPathPermitsProject(path: string, conveningId: string): boolean {
  if (path.includes("..") || path.includes("\\") || path.includes("%")) return false;
  if (!path.startsWith("convenings/")) return true;
  const match = /^convenings\/([^/]+)\/uploads\/[a-f0-9-]{36}$/i.exec(path);
  return !!match && match[1] === conveningId;
}

/** Reject references to uploads signed for another convening before saving them. */
export function privateObjectReferencePermitsProject(url: string, conveningId: string): boolean {
  const prefix = url.startsWith("/objects/") ? "/objects/" : "/api/storage/objects/";
  if (!url.startsWith(prefix)) return true;
  return objectPathPermitsProject(url.slice(prefix.length).split("?")[0], conveningId);
}