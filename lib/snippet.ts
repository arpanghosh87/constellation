/** Locate a snippet's lines inside a file (1-based, inclusive), ignoring indentation drift. */
export function findSnippetLines(file: string | undefined, snippet: string) {
  if (!file) return null;
  const want = snippet.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!want.length) return null;
  const lines = file.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== want[0]) continue;
    let j = i;
    let k = 0;
    while (j < lines.length && k < want.length) {
      if (lines[j] === "") {
        j++;
        continue;
      }
      if (lines[j] !== want[k]) break;
      j++;
      k++;
    }
    if (k === want.length) return { start: i + 1, end: j };
  }
  return null;
}
