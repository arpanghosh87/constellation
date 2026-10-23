import type { StarRecord } from "./progress";
import { CATEGORIES, type Category } from "./types";

/** Shared geometry for the constellation map and the shareable debrief card. */
export const MAP_W = 960;
export const MAP_H = 640;
const RX = 330;
const RY = 220;
export const CLUSTER = 56;

/** Deterministic pseudo-random stream in [0, 1) seeded by a string (FNV-1a + avalanche). */
export function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function clusterCenter(c: Category) {
  const i = CATEGORIES.indexOf(c);
  const a = (i / CATEGORIES.length) * Math.PI * 2 - Math.PI / 2;
  return { x: MAP_W / 2 + Math.cos(a) * RX, y: MAP_H / 2 + Math.sin(a) * RY };
}

/** Deterministic position per star inside its category's cluster. */
export function placeStars(stars: StarRecord[]) {
  const pos: Record<string, { x: number; y: number }> = {};
  for (const s of stars) {
    const c = clusterCenter(s.category);
    const rand = seeded(s.id);
    const a = rand() * Math.PI * 2;
    const r = 8 + rand() * (CLUSTER - 8);
    pos[s.id] = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
  }
  return pos;
}

/** A gentle arc between two stars, bowed toward the middle of the sky. */
export function linkPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // Bow scales with distance, so neighbours get a near-straight line instead of a hairpin.
  const bow = 0.35 * Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 320);
  const cx = mx + (MAP_W / 2 - mx) * bow;
  const cy = my + (MAP_H / 2 - my) * bow;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** All real "builds on" edges whose endpoints both exist, oldest concept first. */
export function starEdges(stars: StarRecord[]) {
  const ids = new Set(stars.map((s) => s.id));
  const seen = new Set<string>();
  return stars.flatMap((s) =>
    (s.links ?? [])
      .filter((l) => {
        const key = `${l.to}->${s.id}`;
        if (!ids.has(l.to) || l.to === s.id || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((l) => ({ from: l.to, to: s.id, why: l.why, at: s.earnedAt })),
  );
}
