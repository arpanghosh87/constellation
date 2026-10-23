"use client";
import { create } from "zustand";

export type ProgressStep = { id: string; label: string; state: "active" | "done"; detail?: string };

type BuildProgressState = {
  startedAt: number | null;
  steps: ProgressStep[];
  /** Tail of Claude's summarized reasoning while it plans. */
  thought: string;
  start: () => void;
  /** Mark every active step done, then make `step` the active one (if given). */
  advance: (step?: Omit<ProgressStep, "state">) => void;
  /** Update or add a step without changing which one is active. */
  upsert: (step: ProgressStep) => void;
  addThought: (text: string) => void;
  finish: () => void;
};

const THOUGHT_TAIL = 400;

export const useBuildProgress = create<BuildProgressState>()((set, get) => ({
  startedAt: null,
  steps: [],
  thought: "",
  start: () =>
    set({
      startedAt: Date.now(),
      thought: "",
      steps: [{ id: "send", label: "Sending your request", state: "active" }],
    }),
  advance: (step) => {
    const steps = get().steps.map((s) => (s.state === "active" ? { ...s, state: "done" as const } : s));
    if (step) {
      const i = steps.findIndex((s) => s.id === step.id);
      if (i >= 0) steps[i] = { ...steps[i], ...step, state: "active" };
      else steps.push({ ...step, state: "active" });
    }
    set({ steps });
  },
  upsert: (step) => {
    const steps = [...get().steps];
    const i = steps.findIndex((s) => s.id === step.id);
    if (i >= 0) steps[i] = step;
    else steps.push(step);
    set({ steps });
  },
  addThought: (text) => set({ thought: (get().thought + text).slice(-THOUGHT_TAIL) }),
  finish: () => set({ startedAt: null, steps: [], thought: "" }),
}));

/** The most recent complete-ish sentence of the reasoning tail, for a one-line status. */
export function latestThought(tail: string) {
  const para = tail.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).pop() ?? "";
  const sentences = para.match(/[^.!?]+[.!?]?/g) ?? [];
  const last = sentences.slice(-2).join("").trim();
  return last.length > 180 ? "…" + last.slice(-180).trimStart() : last;
}
