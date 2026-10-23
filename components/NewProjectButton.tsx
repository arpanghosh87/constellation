"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { stopBuild } from "./useBuild";

/** In-app confirm: native confirm() is silently suppressed in some browsers and embeds. */
export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  const busy = useWorkspace((s) => !!s.busy);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const reset = () => {
    stopBuild();
    useWorkspace.getState().newProject();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
      >
        New project
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Start a new project"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 z-50 mt-2 w-72 rounded-xl border border-white/10 bg-panel-2 p-4 shadow-2xl"
          >
            <p className="text-sm font-semibold text-zinc-100">Start a new project?</p>
            <p className="mt-1 text-xs text-zinc-400">
              {busy ? "This stops the current build. " : ""}Your code, chat and glints are cleared. Stars and badges
              stay.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={reset}
                className="rounded-lg bg-star px-3 py-1.5 text-xs font-semibold text-stone-900 hover:brightness-110"
              >
                Start fresh
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
