"use client";
import { motion } from "framer-motion";
import { hashFiles } from "@/lib/hash";
import { useWorkspace } from "@/lib/workspace";

/** The gentle ask after a build: "want to see how this works?" */
export function FlowOfferCard({ messageId }: { messageId: string }) {
  const flowIsCurrent = useWorkspace((s) => !!s.flow && s.flow.hash === hashFiles(s.files));
  const walked = useWorkspace((s) => !!s.flow?.walked);

  const open = () => {
    const ws = useWorkspace.getState();
    ws.setRightTab("flow");
    if (!flowIsCurrent && ws.flowStatus !== "loading") void ws.generateFlow();
    ws.patchMessage(messageId, (m) => ({ ...m, offerFlow: false }));
  };
  const dismiss = () =>
    useWorkspace.getState().patchMessage(messageId, (m) => ({ ...m, offerFlow: false }));

  if (flowIsCurrent && walked) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 rounded-xl border border-sky-300/30 bg-sky-300/[0.05] px-3 py-2.5"
    >
      <p className="text-sm text-zinc-200">🗺️ Want to see how this works under the hood?</p>
      <p className="mt-0.5 text-xs text-zinc-500">A one-minute walkthrough of the data flow · +1 ★</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={open}
          className="rounded-lg bg-sky-300 px-3 py-1 text-xs font-semibold text-stone-900 hover:brightness-110"
        >
          Show me
        </button>
        <button onClick={dismiss} className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300">
          Not now
        </button>
      </div>
    </motion.div>
  );
}
