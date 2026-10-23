import { findSnippetLines } from "./snippet";

const indentOf = (line: string) => /^\s*/.exec(line)?.[0] ?? "";

/**
 * Replace the snippet's lines in `file` with `alternative`, re-indented to sit
 * where the original lines were. Returns null if the snippet can't be found.
 */
export function swapInAlternative(file: string, snippet: string, alternative: string): string | null {
  const range = findSnippetLines(file, snippet);
  if (!range) return null;
  const lines = file.split("\n");
  const baseIndent = indentOf(lines[range.start - 1]);

  const alt = alternative.replace(/^\n+|\s+$/g, "").split("\n");
  const minIndent = Math.min(
    ...alt.filter((l) => l.trim()).map((l) => indentOf(l).length),
  );
  const reindented = alt.map((l) => (l.trim() ? baseIndent + l.slice(minIndent) : ""));

  lines.splice(range.start - 1, range.end - range.start + 1, ...reindented);
  return lines.join("\n");
}
