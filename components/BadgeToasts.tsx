"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect } from "react";
import { badgeById, useProgress } from "@/lib/progress";

export function BadgeToasts() {
  const pending = useProgress((s) => s.pendingBadges);
  const dismiss = useProgress((s) => s.dismissBadge);
  const current = pending[0] ? badgeById(pending[0]) : undefined;

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => dismiss(current.id), 5500);
    return () => clearTimeout(t);
  }, [current, dismiss]);

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-star/40 bg-panel-2/95 px-5 py-4 shadow-[0_0_50px_-10px_rgba(250,204,21,0.6)] backdrop-blur"
          >
            <motion.span
              initial={{ rotate: -180, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.15, type: "spring" }}
              className="text-4xl"
            >
              {current.icon}
            </motion.span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-star">Badge unlocked</p>
              <p className="text-base font-semibold text-zinc-100">{current.name}</p>
              <p className="text-xs text-zinc-400">{current.description}</p>
            </div>
            <Link
              href="/constellation"
              onClick={() => dismiss(current.id)}
              className="ml-2 text-xs text-zinc-400 hover:text-zinc-100"
            >
              View →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
