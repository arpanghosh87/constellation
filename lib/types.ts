// Shared between server routes and the browser.

export const CATEGORIES = [
  "cleanup",
  "security",
  "performance",
  "accessibility",
  "state",
  "edge-cases",
  "architecture",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; color: string; blurb: string }> = {
  cleanup: { label: "Cleanup & Leaks", color: "#38bdf8", blurb: "Timers, listeners, subscriptions" },
  security: { label: "Security & Validation", color: "#f87171", blurb: "Untrusted input, XSS, injection" },
  performance: { label: "Performance", color: "#facc15", blurb: "Renders, memoization, work avoided" },
  accessibility: { label: "Accessibility", color: "#4ade80", blurb: "Semantics, keyboard, screen readers" },
  state: { label: "State Management", color: "#c084fc", blurb: "Where state lives and how it flows" },
  "edge-cases": { label: "Edge Cases", color: "#fb923c", blurb: "Empty, huge, concurrent, weird" },
  architecture: { label: "Architecture", color: "#94a3b8", blurb: "Structure, boundaries, naming" },
};

export type MentorMode = "off" | "subtle" | "curious";

export type GlintPayload = {
  id: string;
  path: string;
  snippet: string;
  title: string;
  teaser: string;
  category: Category;
  concept: string;
  /** Refs into the learner profile sent with the request (mapped to ids client-side). */
  buildsOn: RefLink[];
  retestOf: string | null;
};

export type RefLink = { ref: string; why: string };

/** What Claude knows about the learner, with short refs instead of internal ids. */
export type LearnerProfile = {
  learned: { ref: string; concept: string; headline: string }[];
  weakSpots: { ref: string; concept: string; gap: string }[];
};

export type BuildEvent =
  | { type: "status"; status: "thinking" | "writing" }
  /** Summarized reasoning, streamed so long planning phases show real progress. */
  | { type: "thought"; text: string }
  | { type: "text"; text: string }
  | { type: "file_progress"; id: string; path: string; content: string }
  | { type: "file_done"; id: string; path: string; content: string }
  | { type: "glint"; glint: GlintPayload }
  | { type: "error"; message: string }
  | { type: "done" };

export type Lesson = {
  verdict: "nailed" | "partial" | "miss" | null;
  feedback: string | null;
  /** One emoji that captures the idea. */
  emoji: string;
  /** The reusable rule, short and quotable. This is what we want remembered. */
  headline: string;
  why: string;
  breaks: string;
  category: Category;
  concept: string;
  /** The specific gap behind a wrong or partial guess, kept for a later re-test. */
  misconception: string | null;
  buildsOn: RefLink[];
};

export type LessonEvent =
  | { type: "thought"; text: string }
  | { type: "delta"; text: string }
  | { type: "lesson"; lesson: Lesson }
  | { type: "error"; message: string };

/** The "B" side of an A/B experiment, generated on demand and checked server-side. */
export type AbVariant = {
  /** Verbatim block of the file that B replaces (includes the glint's lines). */
  original: string;
  alternative: string;
  whatChanged: string;
  /** Honest wait before the difference is visible (0 = immediate). */
  minutesToObserve: number;
  tryIt: string;
};

export type Rating = { rating: "up" | "down"; reason: string | null; at: number };

/** Lessons saved before v2 had long-form fields; map them onto the compact shape. */
export function normalizeLesson(l: unknown): Lesson {
  // Older lessons also carried an inline `alternative`; it's dropped on purpose
  // (it could be unfair) and regenerated through /api/ab on demand.
  const o = l as Partial<Lesson> & { whatBreaks?: string; principle?: string };
  return {
    verdict: o.verdict ?? null,
    feedback: o.feedback ?? null,
    emoji: o.emoji ?? "✦",
    headline: o.headline ?? o.principle ?? o.concept ?? "",
    why: o.why ?? "",
    breaks: o.breaks ?? o.whatBreaks ?? "",
    misconception: o.misconception ?? null,
    buildsOn: o.buildsOn ?? [],
    category: o.category ?? "architecture",
    concept: o.concept ?? "",
  };
}

// ---------- How-it-works flow maps ----------

export const FLOW_NODE_KINDS = [
  "user",
  "component",
  "state",
  "effect",
  "handler",
  "function",
  "storage",
  "external",
] as const;
export type FlowNodeKind = (typeof FLOW_NODE_KINDS)[number];

export const FLOW_EDGE_KINDS = ["event", "data", "render", "call"] as const;
export type FlowEdgeKind = (typeof FLOW_EDGE_KINDS)[number];

export type FlowNode = {
  id: string;
  label: string;
  kind: FlowNodeKind;
  path: string;
  /** One verbatim line from the file, used to jump to the code. */
  snippet: string;
  detail: string;
};
export type FlowEdge = { from: string; to: string; label: string; kind: FlowEdgeKind };
/** One hop of the walkthrough story. */
export type FlowStep = { from: string; to: string; text: string };

export type Flow = {
  title: string;
  /** The mental model in one short line. */
  takeaway: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  steps: FlowStep[];
};
