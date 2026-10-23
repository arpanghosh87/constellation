"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { totalStars } from "@/lib/badges";
import { useProgress } from "@/lib/progress";
import { useHydrated } from "./useHydrated";

export function StarCounter() {
  const hydrated = useHydrated();
  const stars = useProgress((s) => s.stars);
  const badges = useProgress((s) => s.badges);
  const lastAward = useProgress((s) => s.lastAward);
  const total = hydrated ? totalStars(stars) : 0;

  return (
    <Link
      href="/constellation"
      title="Open your constellation"
      className="relative flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm hover:bg-white/[0.08] sm:gap-3"
    >
      <motion.span
        key={lastAward?.at ?? "idle"}
        initial={lastAward ? { scale: 1.8, rotate: -30 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 12 }}
        className="text-star"
      >
        ★
      </motion.span>
      <span className="font-semibold tabular-nums text-zinc-100">{total}</span>
      <span className="hidden text-zinc-500 sm:inline">·</span>
      <span className="hidden text-zinc-400 sm:inline">{hydrated ? badges.length : 0} badges</span>
      <AnimatePresence>
        {lastAward && (
          <motion.span
            key={lastAward.at}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -24 }}
            transition={{ duration: 1.4 }}
            className="pointer-events-none absolute -top-1 left-4 text-sm font-bold text-star"
          >
            +{lastAward.amount}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
