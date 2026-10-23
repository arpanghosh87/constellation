/**
 * Shorten text to at most `max` characters, cutting at a word boundary and
 * adding "…" when anything was removed. Falls back to a hard cut only when a
 * single word is longer than half the budget.
 */
export function clipWords(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const base = space > max * 0.5 ? cut.slice(0, space) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, "") + "…";
}
