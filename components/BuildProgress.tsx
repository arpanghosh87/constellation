"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { latestThought, useBuildProgress } from "@/lib/buildProgress";

export function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}

export const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Live checklist of what the build is doing right now, with Claude's current thought. */
export function BuildProgress() {
  const { startedAt, steps, thought } = useBuildProgress();
  const elapsed = useElapsed(startedAt);
  const planning = steps.find((s) => s.id === "plan")?.state === "active";
  const line = latestThought(thought);

  if (!startedAt) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[13px]">
      <ul className="space-y-1">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            {s.state === "done" ? (
              <span className="w-3 text-center text-emerald-400">✓</span>
            ) : (
              <span className="flex w-3 justify-center">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-star" />
              </span>
            )}
            <span className={s.state === "done" ? "text-zinc-500" : "text-zinc-200"}>{s.label}</span>
            {s.detail && <span className="ml-auto font-mono text-[11px] text-zinc-500">{s.detail}</span>}
          </li>
        ))}
      </ul>
      <AnimatePresence mode="wait">
        {planning && line && (
          <motion.p
            key={line.slice(0, 40)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 border-l-2 border-star/40 pl-2 text-xs italic leading-relaxed text-zinc-400"
          >
            💭 {line}
          </motion.p>
        )}
      </AnimatePresence>
      <p className="mt-2 font-mono text-[11px] text-zinc-600">{formatElapsed(elapsed)}</p>
    </div>
  );
}
