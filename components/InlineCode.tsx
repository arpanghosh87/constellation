import { Fragment } from "react";

/** Render `code` and **bold** spans; everything else as plain text. */
export function InlineCode({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
        if (p.length > 4 && p.startsWith("**") && p.endsWith("**"))
          return (
            <strong key={i} className="font-semibold text-zinc-100">
              {p.slice(2, -2)}
            </strong>
          );
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** Paragraphs and "- " bullet lists with inline formatting. Enough for chat replies. */
export function RichText({ text }: { text: string }) {
  const blocks: { kind: "p" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.kind === "ul") last.lines.push(bullet[1]);
      else blocks.push({ kind: "ul", lines: [bullet[1]] });
    } else if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
    } else if (last?.kind === "p" && last.lines.length) {
      last.lines.push(line.replace(/^#+\s*/, ""));
    } else {
      blocks.push({ kind: "p", lines: [line.replace(/^#+\s*/, "")] });
    }
  }
  return (
    <div className="prose-code space-y-2">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.kind === "ul" ? (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.lines.map((l, j) => (
                <li key={j}>
                  <InlineCode text={l} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i}>
              <InlineCode text={b.lines.join(" ")} />
            </p>
          ),
        )}
    </div>
  );
}
