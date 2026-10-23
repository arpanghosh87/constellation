"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BADGES, earnedBadgeIds } from "./badges";
import { normalizeLesson, type Category, type LearnerProfile, type Lesson, type Rating } from "./types";

export type StarRecord = {
  /** Glint id (or selection hash for ask-why). One record per id: no farming. */
  id: string;
  stars: number;
  title: string;
  concept: string;
  category: Category;
  path: string;
  snippet: string;
  lesson: Lesson;
  verdict: Lesson["verdict"];
  source: "glint" | "ask-why" | "flow";
  earnedAt: number;
  /** "Builds on" links to earlier stars: the constellation lines. */
  links: StarLink[];
  /** Which project it was earned in (for the debrief and hover cards). */
  projectId?: string;
  projectName?: string;
};

export type StarLink = { to: string; why: string };

/** A wrong or partial guess, remembered so a later glint can quietly re-test it. */
export type Misconception = {
  /** Id of the glint where it happened. */
  id: string;
  concept: string;
  headline: string;
  gap: string;
  guess: string;
  at: number;
  status: "open" | "cleared";
  attempts: number;
  clearedBy?: string;
  clearedAt?: number;
};

type ProgressState = {
  stars: StarRecord[];
  badges: string[];
  /** Badges unlocked but not yet celebrated with a toast. */
  pendingBadges: string[];
  /** Bumps on every award so the counter can animate. */
  lastAward: { id: string; amount: number; at: number } | null;
  /** Thumbs up/down per glint id. */
  ratings: Record<string, Rating>;
  misconceptions: Misconception[];
  addMisconception: (m: Omit<Misconception, "status" | "attempts" | "at">) => void;
  /** Result of a re-test: nailed clears it, anything else counts as another attempt. */
  resolveRetest: (id: string, byGlint: string, nailed: boolean) => void;
  rate: (id: string, rating: Rating["rating"], reason?: string | null) => void;
  award: (record: Omit<StarRecord, "earnedAt" | "links"> & { links?: StarLink[] }) => number;
  dismissBadge: (id: string) => void;
  reset: () => void;
};

export function starsFor(verdict: Lesson["verdict"]) {
  return verdict === "nailed" ? 2 : 1;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      stars: [],
      badges: [],
      pendingBadges: [],
      lastAward: null,
      ratings: {},
      misconceptions: [],
      addMisconception: (m) => {
        if (get().misconceptions.some((x) => x.id === m.id)) return;
        set({ misconceptions: [...get().misconceptions, { ...m, status: "open", attempts: 1, at: Date.now() }] });
      },
      resolveRetest: (id, byGlint, nailed) => {
        const misconceptions = get().misconceptions.map((x) =>
          x.id !== id || x.status === "cleared"
            ? x
            : nailed
              ? { ...x, status: "cleared" as const, clearedBy: byGlint, clearedAt: Date.now() }
              : { ...x, attempts: x.attempts + 1 },
        );
        const badges = earnedBadgeIds(get().stars, misconceptions);
        const fresh = badges.filter((b) => !get().badges.includes(b));
        set({ misconceptions, badges, pendingBadges: [...get().pendingBadges, ...fresh] });
      },
      rate: (id, rating, reason = null) =>
        set({ ratings: { ...get().ratings, [id]: { rating, reason, at: Date.now() } } }),
      award: (record) => {
        if (get().stars.some((s) => s.id === record.id)) return 0;
        const stars = [...get().stars, { ...record, links: record.links ?? [], earnedAt: Date.now() }];
        const badges = earnedBadgeIds(stars, get().misconceptions);
        const fresh = badges.filter((b) => !get().badges.includes(b));
        set({
          stars,
          badges,
          pendingBadges: [...get().pendingBadges, ...fresh],
          lastAward: { id: record.id, amount: record.stars, at: Date.now() },
        });
        return record.stars;
      },
      dismissBadge: (id) => set({ pendingBadges: get().pendingBadges.filter((b) => b !== id) }),
      reset: () =>
        set({ stars: [], badges: [], pendingBadges: [], lastAward: null, ratings: {}, misconceptions: [] }),
    }),
    {
      name: "constellation-progress",
      version: 3,
      partialize: ({ stars, badges, ratings, misconceptions }) => ({ stars, badges, ratings, misconceptions }),
      migrate: (state) => {
        const s = state as { stars?: StarRecord[]; ratings?: Record<string, Rating>; misconceptions?: Misconception[] };
        s.stars = (s.stars ?? []).map((r) => ({ ...r, links: r.links ?? [], lesson: normalizeLesson(r.lesson) }));
        s.ratings ??= {};
        s.misconceptions ??= [];
        return state as ProgressState;
      },
    },
  ),
);

export function badgeById(id: string) {
  return BADGES.find((b) => b.id === id);
}

/**
 * What Claude gets to know about the learner, using short refs (L1, W1…) so it
 * never has to echo internal ids. The maps translate refs back.
 */
export function learnerProfile(stars: StarRecord[], misconceptions: Misconception[]) {
  const byConcept = new Map<string, StarRecord>();
  for (const s of stars) if (s.source !== "flow") byConcept.set(s.concept.toLowerCase(), s);
  const learnedStars = [...byConcept.values()].slice(-40);
  const open = misconceptions.filter((m) => m.status === "open").slice(-10);

  const learnedRef: Record<string, string> = {};
  const weakRef: Record<string, string> = {};
  const profile: LearnerProfile = {
    learned: learnedStars.map((s, i) => {
      learnedRef[`L${i + 1}`] = s.id;
      return { ref: `L${i + 1}`, concept: clip(s.concept, 120), headline: clip(s.lesson.headline, 240) };
    }),
    weakSpots: open.map((m, i) => {
      weakRef[`W${i + 1}`] = m.id;
      return { ref: `W${i + 1}`, concept: clip(m.concept, 120), gap: clip(m.gap, 240) };
    }),
  };
  return { profile, learnedRef, weakRef };
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

const dayKey = (d: Date) => d.toDateString();

/** Consecutive local calendar days (ending today or yesterday) with at least one star. */
export function dayStreak(stars: StarRecord[], now = Date.now()) {
  const days = new Set(stars.map((s) => dayKey(new Date(s.earnedAt))));
  // Step by calendar day (not 24h), so 23h/25h daylight-saving days count once.
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** How a star was earned, in words, for hover cards and glint cards. */
export function howEarned(star: StarRecord): { icon: string; text: string } {
  if (star.source === "flow") return { icon: "🗺️", text: "Walked through a how-it-works map" };
  if (star.source === "ask-why") return { icon: "❓", text: "Asked “why?” about code you selected" };
  if (star.verdict === "nailed") return { icon: "🎯", text: "Guessed it cold, before seeing the answer" };
  if (star.verdict === "partial") return { icon: "🤔", text: "Close guess, then learned the rest" };
  if (star.verdict === "miss") return { icon: "🧭", text: "Guessed, missed, then learned it" };
  return { icon: "📖", text: "Asked me to explain" };
}
