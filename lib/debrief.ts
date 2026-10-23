import { conceptCount, totalStars } from "./badges";
import { linkPath, MAP_H, MAP_W, placeStars, starEdges } from "./constellationLayout";
import { dayStreak, type Misconception, type StarRecord } from "./progress";
import { clipWords } from "./text";
import { CATEGORY_META } from "./types";

export type Debrief = {
  built: string;
  date: string;
  learned: StarRecord[];
  starsEarned: number;
  guessedCold: number;
  connections: number;
  cleared: number;
  streak: number;
  totalStars: number;
  totalConcepts: number;
};

/** "Build a pomodoro timer…" -> "a pomodoro timer…" */
export function projectName(firstPrompt: string | undefined) {
  if (!firstPrompt) return "something new";
  const cleaned = firstPrompt
    .trim()
    .replace(/^(please\s+)?(can you\s+)?(build|make|create|write|code)\s+(me\s+)?/i, "")
    .replace(/[.!]+$/, "");
  return clipWords(cleaned, 70) || "something new";
}

export function computeDebrief(args: {
  projectId: string;
  firstPrompt: string | undefined;
  stars: StarRecord[];
  misconceptions: Misconception[];
}): Debrief {
  const project = args.stars.filter((s) => s.projectId === args.projectId);
  const projectIds = new Set(project.map((s) => s.id));
  return {
    built: projectName(args.firstPrompt),
    date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    learned: project.filter((s) => s.source !== "flow"),
    starsEarned: totalStars(project),
    guessedCold: project.filter((s) => s.verdict === "nailed").length,
    connections: project.reduce((n, s) => n + s.links.length, 0),
    cleared: args.misconceptions.filter((m) => m.status === "cleared" && m.clearedBy && projectIds.has(m.clearedBy)).length,
    streak: dayStreak(args.stars),
    totalStars: totalStars(args.stars),
    // Same definition as the constellation page, so the card and the sky always agree.
    totalConcepts: conceptCount(args.stars),
  };
}

export function debriefText(d: Debrief) {
  const lines = [
    `✦ I built ${d.built} with Constellation and learned ${d.learned.length} engineering concept${d.learned.length === 1 ? "" : "s"}:`,
    ...d.learned.slice(0, 5).map((s) => `${s.lesson.emoji} ${s.lesson.headline}`),
    "",
    [
      `★ ${d.starsEarned} star${d.starsEarned === 1 ? "" : "s"}`,
      d.guessedCold ? `🎯 ${d.guessedCold} guessed cold` : "",
      d.connections ? `🔗 ${d.connections} connection${d.connections === 1 ? "" : "s"}` : "",
      d.cleared ? `🌱 ${d.cleared} misconception${d.cleared === 1 ? "" : "s"} cleared` : "",
      d.streak > 1 ? `🔥 ${d.streak}-day streak` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  ];
  return lines.join("\n");
}

export const CARD_W = 1200;
export const CARD_H = 630;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (s: string) => s.replace(/`/g, "");


/** Word-wrap into at most `lines` lines of `max` chars; the last line gets an ellipsis if needed. */
function wrap(text: string, max: number, lines: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length <= max) line = (line + " " + word).trim();
    else {
      out.push(line);
      line = word;
    }
  }
  out.push(line);
  if (out.length <= lines) return out.filter(Boolean);
  const kept = out.slice(0, lines);
  kept[lines - 1] = clipWords(out.slice(lines - 1).join(" "), max);
  return kept;
}

/** The shareable card as a standalone SVG (no external fonts or images). */
export function renderDebriefSvg(d: Debrief, allStars: StarRecord[]) {
  const font = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"`;
  const mono = `font-family="ui-monospace, SFMono-Regular, Menlo, monospace"`;

  // Mini constellation, right side: zoomed to fit the stars (whole-sky coordinates leave it tiny).
  const panel = { x: 720, y: 120, w: 420, h: 400 };
  const pos = placeStars(allStars);
  const pts = Object.values(pos);
  const minX = Math.min(...pts.map((p) => p.x), MAP_W / 2);
  const maxX = Math.max(...pts.map((p) => p.x), MAP_W / 2);
  const minY = Math.min(...pts.map((p) => p.y), MAP_H / 2);
  const maxY = Math.max(...pts.map((p) => p.y), MAP_H / 2);
  const spanX = Math.max(maxX - minX, 240) + 80;
  const spanY = Math.max(maxY - minY, 240) + 80;
  const scale = Math.min(panel.w / spanX, panel.h / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const tx = (p: { x: number; y: number }) => ({
    x: panel.x + panel.w / 2 + (p.x - cx) * scale,
    y: panel.y + panel.h / 2 + (p.y - cy) * scale,
  });
  const projectIds = new Set(d.learned.map((s) => s.id));
  const edges = starEdges(allStars);
  const edgeSvg = edges
    .map((e) => {
      const hot = projectIds.has(e.to);
      return `<path d="${linkPath(tx(pos[e.from]), tx(pos[e.to]))}" fill="none" stroke="#facc15" stroke-width="${hot ? 3 : 1.6}" stroke-opacity="${hot ? 0.95 : 0.35}" filter="url(#g)"/>`;
    })
    .join("");
  const starSvg = allStars
    .map((s) => {
      const p = tx(pos[s.id]);
      const hot = projectIds.has(s.id);
      const color = CATEGORY_META[s.category].color;
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${hot ? 8 : 4.5}" fill="${hot ? color : "#a1a1aa"}" fill-opacity="${hot ? 1 : 0.4}" filter="url(#g)"/>`;
    })
    .join("");

  // Zeros don't belong on a brag card: always show the first two, the rest only when earned.
  const stats = [
    { n: d.learned.length, label: d.learned.length === 1 ? "concept learned" : "concepts learned" },
    { n: d.starsEarned, label: d.starsEarned === 1 ? "star earned" : "stars earned" },
    ...(d.guessedCold ? [{ n: d.guessedCold, label: "guessed cold" }] : []),
    ...(d.connections ? [{ n: d.connections, label: d.connections === 1 ? "connection" : "connections" }] : []),
    ...(d.cleared ? [{ n: d.cleared, label: d.cleared === 1 ? "misconception cleared" : "misconceptions cleared" }] : []),
  ].slice(0, 4);
  const statSvg = stats
    .map(
      (s, i) => `
    <g transform="translate(${60 + i * 150}, 340)">
      <text ${font} font-size="44" font-weight="700" fill="#fafafa">${s.n}</text>
      <text ${font} y="28" font-size="15" fill="#a1a1aa">${esc(s.label)}</text>
    </g>`,
    )
    .join("");

  const rules = d.learned.slice(0, 4);
  const ruleSvg = rules.length
    ? rules
        .map(
          (s, i) =>
            `<text ${font} x="60" y="${440 + i * 38}" font-size="21" fill="#e4e4e7">${esc(s.lesson.emoji)}  ${esc(clipWords(plain(s.lesson.headline), 46))}</text>`,
        )
        .join("")
    : `<text ${font} x="60" y="440" font-size="20" fill="#71717a">No concepts this round. Next time, catch a ✦.</text>`;

  const footer = [`★ ${d.totalStars} star${d.totalStars === 1 ? "" : "s"}`, `${d.totalConcepts} concept${d.totalConcepts === 1 ? "" : "s"} in my sky`, d.streak > 0 ? `🔥 ${d.streak}-day streak` : ""]
    .filter(Boolean)
    .join("   ·   ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <radialGradient id="bg" cx="75%" cy="30%" r="90%">
      <stop offset="0" stop-color="#161631"/><stop offset="1" stop-color="#07070d"/>
    </radialGradient>
    <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" rx="28" fill="none" stroke="#facc15" stroke-opacity="0.25"/>
  <text ${font} x="60" y="80" font-size="22" font-weight="600" fill="#facc15">✦ Constellation</text>
  <text ${mono} x="${CARD_W - 60}" y="80" font-size="16" fill="#71717a" text-anchor="end">${esc(d.date)}</text>
  <text ${font} x="60" y="160" font-size="22" fill="#a1a1aa">I built</text>
  ${wrap(d.built, 30, 2)
    .map((l, i) => `<text ${font} x="60" y="${210 + i * 48}" font-size="40" font-weight="700" fill="#fafafa">${esc(l)}</text>`)
    .join("")}
  ${statSvg}
  ${ruleSvg}
  <text ${font} x="60" y="598" font-size="16" fill="#a1a1aa">${esc(footer)}</text>
  <g>${edgeSvg}${starSvg}</g>
  <text ${font} x="${panel.x + panel.w / 2}" y="${panel.y + panel.h + 40}" font-size="14" fill="#71717a" text-anchor="middle">this project in color · lines = ideas that build on each other</text>
</svg>`;
}

export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasterize the card to PNG at 2x for crisp sharing. */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const img = new Image();
  img.decoding = "async";
  img.src = svgDataUrl(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * scale;
  canvas.height = CARD_H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't render the card"))), "image/png"),
  );
}
