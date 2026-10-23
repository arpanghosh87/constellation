import type { Category } from "./types";
import type { Misconception, StarRecord } from "./progress";

export type Badge = {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Set on category badges, so the sky can say what an empty category unlocks. */
  category?: Category;
  earned: (stars: StarRecord[], misconceptions: Misconception[]) => boolean;
};

const total = (stars: StarRecord[]) => stars.reduce((n, s) => n + s.stars, 0);
/** Category badges are about concepts; walking a flow map isn't an Architecture concept. */
const inCategory = (stars: StarRecord[], c: Category) =>
  stars.filter((s) => s.category === c && s.source !== "flow").reduce((n, s) => n + s.stars, 0);

const milestone = (id: string, name: string, icon: string, n: number): Badge => ({
  id,
  name,
  icon,
  description: `Earn ${n} star${n === 1 ? "" : "s"}`,
  earned: (s) => total(s) >= n,
});

export const CATEGORY_THRESHOLD = 3;
const category = (id: string, name: string, icon: string, c: Category, what: string): Badge => ({
  id,
  name,
  icon,
  description: `${CATEGORY_THRESHOLD} stars in ${what}`,
  category: c,
  earned: (s) => inCategory(s, c) >= CATEGORY_THRESHOLD,
});

export const BADGES: Badge[] = [
  milestone("first-light", "First Light", "✦", 1),
  milestone("stargazer", "Stargazer", "🔭", 10),
  milestone("navigator", "Navigator", "🧭", 25),
  milestone("astronomer", "Astronomer", "🌌", 50),
  category("leak-hunter", "Leak Hunter", "🧹", "cleanup", "cleanup & leaks"),
  category("gatekeeper", "Gatekeeper", "🛡️", "security", "security & validation"),
  category("speed-demon", "Speed Demon", "⚡", "performance", "performance"),
  category("inclusive-builder", "Inclusive Builder", "♿", "accessibility", "accessibility"),
  category("state-whisperer", "State Whisperer", "🔮", "state", "state management"),
  category("edge-case-detective", "Edge Case Detective", "🕵️", "edge-cases", "edge cases"),
  category("architect", "Architect", "🏛️", "architecture", "architecture"),
  {
    id: "sharp-eye",
    name: "Sharp Eye",
    icon: "🎯",
    description: "Nail 3 guesses before seeing the answer",
    earned: (s) => s.filter((r) => r.verdict === "nailed").length >= 3,
  },
  {
    id: "cartographer",
    name: "Cartographer",
    icon: "🗺️",
    description: "Connect 3 concepts to ones you learned earlier",
    earned: (s) => connectionCount(s) >= 3,
  },
  {
    id: "comeback",
    name: "Comeback",
    icon: "🌱",
    description: "Nail a concept you once got wrong",
    earned: (_, m) => m.some((x) => x.status === "cleared"),
  },
];

export function earnedBadgeIds(stars: StarRecord[], misconceptions: Misconception[]) {
  return BADGES.filter((b) => b.earned(stars, misconceptions)).map((b) => b.id);
}

/** Distinct "builds on" links (older data may hold duplicates). */
export function connectionCount(stars: StarRecord[]) {
  return stars.reduce((n, s) => n + new Set((s.links ?? []).map((l) => l.to)).size, 0);
}

export function totalStars(stars: StarRecord[]) {
  return total(stars);
}

/** Lifetime concepts in the sky: one per star, exactly what the constellation lists and draws. */
export function conceptCount(stars: StarRecord[]) {
  return stars.length;
}
