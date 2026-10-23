"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkspace } from "@/lib/workspace";
import { InlineCode } from "./InlineCode";

/** Floating switcher while an A/B swap is live, so the preview stays visible. */
export function AbBar() {
  const abTest = useWorkspace((s) => s.abTest);
  const glint = useWorkspace((s) => (s.abTest ? s.glints[s.abTest.glintId] : undefined));
  const drawerOpen = useWorkspace((s) => !!s.openGlintId);
  const { setAbMode, endAb, openGlint } = useWorkspace.getState();

  const show = abTest && glint && !drawerOpen;
  const isB = abTest?.mode === "B";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className={`fixed bottom-5 right-5 z-30 w-[min(380px,calc(100vw-2.5rem))] rounded-2xl border bg-panel-2/95 p-4 shadow-2xl backdrop-blur ${
            isB ? "border-rose-400/50 shadow-rose-500/10" : "border-emerald-400/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              🔀 {glint.lesson?.concept || glint.concept}
            </p>
            <button
              onClick={endAb}
              className="rounded-md px-2 py-0.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            >
              Done · keep A
            </button>
          </div>

          <div role="radiogroup" aria-label="Version" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-black/40 p-1">
            {(["A", "B"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={abTest.mode === m}
                onClick={() => setAbMode(m)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  abTest.mode === m
                    ? m === "A"
                      ? "bg-emerald-400 text-stone-950"
                      : "bg-rose-400 text-stone-950"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {m === "A" ? "A · what I wrote" : "B · naive way"}
              </button>
            ))}
          </div>

          <p className="prose-code mt-3 text-sm text-zinc-300">
            {isB ? "The preview is running B now. " : "Back on A. "}
            {glint.ab && (
              <>
                🧪 <InlineCode text={glint.ab.tryIt} />
              </>
            )}
          </p>
          {abTest.bEdited && (
            <p className="mt-2 text-xs text-rose-200/80">Your edits to B are discarded when you keep A.</p>
          )}
          <button
            onClick={() => openGlint(glint.id)}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Reopen lesson ↗
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
