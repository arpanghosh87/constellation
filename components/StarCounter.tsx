"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { totalStars } from "@/lib/badges";
import { useProgress } from "@/lib/progress";

/** Rendered only in the client-only workspace, where persisted progress is already loaded. */
export function StarCounter() {
  const stars = useProgress((s) => s.stars);
  const badges = useProgress((s) => s.badges);
  const lastAward = useProgress((s) => s.lastAward);
  const total = totalStars(stars);
  // Celebrate only awards earned while this counter is on screen. lastAward
  // stays in memory across page navigations, so a remount would replay it.
  const [mountedAt] = useState(() => Date.now());
  const fresh = lastAward && lastAward.at >= mountedAt ? lastAward : null;

  return (
    <Link
      href="/constellation"
      title="Open your constellation"
      className="relative flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm hover:bg-white/[0.08] sm:gap-3"
    >
      <motion.span
        key={fresh?.at ?? "idle"}
        initial={fresh ? { scale: 1.8, rotate: -30 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 12 }}
        className="text-star"
      >
        ★
      </motion.span>
      <span className="font-semibold tabular-nums text-zinc-100">{total}</span>
      <span className="hidden text-zinc-500 sm:inline">·</span>
      <span className="hidden text-zinc-400 sm:inline">{badges.length} badges</span>
      <AnimatePresence>
        {fresh && (
          <motion.span
            key={fresh.at}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -24 }}
            transition={{ duration: 1.4 }}
            className="pointer-events-none absolute -top-1 left-4 text-sm font-bold text-star"
          >
            +{fresh.amount}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
