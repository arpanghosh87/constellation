"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_META } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

export function GlintsTray() {
  const glints = useWorkspace((s) => s.glints);
  const openGlint = useWorkspace((s) => s.openGlint);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const list = Object.values(glints).sort((a, b) => b.createdAt - a.createdAt);
  const unseen = list.filter((g) => g.status !== "learned").length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.08]"
      >
        <span className="text-star">✦</span>
        <span className="hidden sm:inline">Glints</span>
        {unseen > 0 && (
          <span className="rounded-full bg-star px-1.5 text-[11px] font-bold text-stone-900">{unseen}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-50 mt-2 max-h-[60vh] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-white/10 bg-panel-2 p-2 shadow-2xl"
          >
            {list.length === 0 && (
              <p className="p-3 text-sm text-zinc-500">
                No glints yet. When I make a decision worth understanding, it&apos;ll show up here.
              </p>
            )}
            {list.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  openGlint(g.id);
                  setOpen(false);
                }}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={g.status === "learned" ? "text-nebula" : "text-star"}>
                    {g.status === "learned" ? "★" : "✦"}
                  </span>
                  <span style={{ color: CATEGORY_META[g.category].color }}>
                    {g.concept || CATEGORY_META[g.category].label}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-zinc-300">{g.teaser || g.title}</p>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
