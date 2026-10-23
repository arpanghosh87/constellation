/** Small stable string hash (djb2), base36. Not cryptographic. */
export function hashString(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

let lastFiles: Record<string, string> | null = null;
let lastHash = "";

/**
 * Identifies a project version, so a flow map knows when it's stale. Called from
 * store selectors on every update, so it's memoized on the (immutable) files object.
 */
export function hashFiles(files: Record<string, string>) {
  if (files === lastFiles) return lastHash;
  lastFiles = files;
  lastHash = hashString(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
  return lastHash;
}
