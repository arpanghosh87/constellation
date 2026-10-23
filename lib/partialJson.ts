const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "\\": "\\",
  "/": "/",
};

/**
 * Pull a string field out of a JSON object that is still streaming in.
 * Returns the decoded prefix received so far, stopping before any escape
 * sequence that hasn't fully arrived yet.
 */
export function extractStringField(
  buf: string,
  key: string,
): { value: string; complete: boolean } | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(buf);
  if (!m) return null;
  let i = m.index + m[0].length;
  let out = "";
  while (i < buf.length) {
    const c = buf[i];
    if (c === '"') return { value: out, complete: true };
    if (c === "\\") {
      if (i + 1 >= buf.length) break;
      const n = buf[i + 1];
      if (n === "u") {
        if (i + 6 > buf.length) break;
        out += String.fromCharCode(parseInt(buf.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += ESCAPES[n] ?? n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return { value: out, complete: false };
}
