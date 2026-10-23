"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { computeDebrief, debriefText, renderDebriefSvg, svgDataUrl, svgToPngBlob } from "@/lib/debrief";
import { useProgress } from "@/lib/progress";
import { useWorkspace } from "@/lib/workspace";

export function useDebriefOpen() {
  return useWorkspace((s) => s.debriefOpen);
}

/** The ending: what you built, what you learned, and a card to share. */
export function DebriefModal() {
  const open = useWorkspace((s) => s.debriefOpen);
  const close = () => useWorkspace.getState().setDebriefOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            role="dialog"
            aria-label="Debrief"
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="w-full max-w-4xl rounded-2xl border border-white/10 bg-panel p-5 shadow-2xl"
          >
            <DebriefBody onClose={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DebriefBody({ onClose }: { onClose: () => void }) {
  const projectId = useWorkspace((s) => s.projectId);
  const firstPrompt = useWorkspace((s) => s.messages.find((m) => m.role === "user")?.text);
  const stars = useProgress((s) => s.stars);
  const misconceptions = useProgress((s) => s.misconceptions);
  const [status, setStatus] = useState("");

  const debrief = useMemo(
    () => computeDebrief({ projectId, firstPrompt, stars, misconceptions }),
    [projectId, firstPrompt, stars, misconceptions],
  );
  const svg = useMemo(() => renderDebriefSvg(debrief, stars), [debrief, stars]);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 2200);
  };

  const download = async () => {
    try {
      const blob = await svgToPngBlob(svg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `constellation-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      // Some browsers start the download asynchronously; don't pull the URL out from under it.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      flash("Downloaded ✓");
    } catch {
      flash("Couldn't render the image");
    }
  };

  const copyImage = async () => {
    try {
      // Safari only allows clipboard writes created synchronously in the click,
      // so hand ClipboardItem the pending blob rather than awaiting it first.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": svgToPngBlob(svg) })]);
      flash("Image copied ✓");
    } catch {
      flash("This browser blocked image copy. Try Download instead.");
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(debriefText(debrief));
      flash("Text copied ✓");
    } catch {
      flash("Couldn't copy text");
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-star">🏁 Debrief</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-50">
            {debrief.learned.length
              ? `You built ${debrief.built} and learned ${debrief.learned.length} concept${debrief.learned.length === 1 ? "" : "s"}.`
              : `You built ${debrief.built}.`}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-400">
            {debrief.learned.length
              ? "Here's your round, ready to share."
              : "No concepts caught this round. Open a ✦ glint next time to light your first star."}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close debrief" className="rounded-md px-2 py-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200">
          ✕
        </button>
      </div>

      {/* The exact image that gets exported. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svgDataUrl(svg)} alt="Your shareable constellation card" className="mt-4 w-full rounded-xl border border-white/10" />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={download} className="rounded-lg bg-star px-4 py-2 text-sm font-semibold text-stone-900 hover:brightness-110">
          Download PNG
        </button>
        <button onClick={copyImage} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5">
          Copy image
        </button>
        <button onClick={copyText} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5">
          Copy text
        </button>
        <span className="text-sm text-zinc-400" aria-live="polite">
          {status}
        </span>
        <button onClick={onClose} className="ml-auto rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100">
          Keep building →
        </button>
      </div>
    </div>
  );
}

/** Offered in chat once every glint from a build has been learned: a natural end to the round. */
export function DebriefOfferCard({ messageId }: { messageId: string }) {
  const dismiss = () => useWorkspace.getState().patchMessage(messageId, (m) => ({ ...m, debriefOffered: false }));
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 rounded-xl border border-star/30 bg-star/[0.05] px-3 py-2.5"
    >
      <p className="text-sm text-zinc-200">🏁 That&apos;s every glint from this round. Nice.</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            useWorkspace.getState().setDebriefOpen(true);
            dismiss();
          }}
          className="rounded-lg bg-star px-3 py-1 text-xs font-semibold text-stone-900 hover:brightness-110"
        >
          See my debrief
        </button>
        <button onClick={dismiss} className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300">
          Keep going
        </button>
      </div>
    </motion.div>
  );
}
