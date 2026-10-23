"use client";
import { motion } from "framer-motion";
import { CATEGORY_META } from "@/lib/types";
import { howEarned, useProgress } from "@/lib/progress";
import { useWorkspace } from "@/lib/workspace";
import { InlineCode } from "./InlineCode";

export function GlintCard({ id }: { id: string }) {
  const glint = useWorkspace((s) => s.glints[id]);
  const openGlint = useWorkspace((s) => s.openGlint);
  const stars = useProgress((s) => s.stars);
  if (!glint) return null;
  const buildsOn = (glint.links ?? []).flatMap((l) => stars.find((st) => st.id === l.to) ?? []);
  const starRecord = stars.find((st) => st.id === glint.id);

  const learned = glint.status === "learned";
  const color = CATEGORY_META[glint.category].color;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      onClick={() => openGlint(id)}
      className={`group mt-2 block w-full rounded-xl border px-3 py-2.5 text-left transition ${
        learned
          ? "border-nebula/30 bg-nebula/5"
          : "border-star/40 bg-star/[0.06] shadow-[0_0_20px_-6px_rgba(250,204,21,0.5)] hover:bg-star/10"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider">
        <span className={learned ? "text-nebula" : "text-star"}>{learned ? "★ Learned" : "✦ Glint"}</span>
        <span className="text-zinc-500">·</span>
        <span style={{ color }}>{glint.concept || CATEGORY_META[glint.category].label}</span>
      </div>
      {learned && glint.lesson ? (
        <p className="prose-code mt-1 text-sm font-medium text-zinc-100">
          <span className="mr-1.5">{glint.lesson.emoji}</span>
          <InlineCode text={glint.lesson.headline} />
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-200">{glint.teaser || glint.title}</p>
      )}
      {buildsOn.length > 0 && (
        <p className="mt-1.5 text-xs text-star/90">
          ↳ builds on {buildsOn.map((st) => `${st.lesson.emoji} ${st.concept}`).join(" + ")}
        </p>
      )}
      {learned && starRecord && (
        <p className="mt-1.5 text-[11px] text-zinc-400">
          {howEarned(starRecord).icon} {howEarned(starRecord).text}{" "}
          <span className="text-star">{"★".repeat(starRecord.stars)}</span>
        </p>
      )}
      <p className="mt-1 font-mono text-[11px] text-zinc-500">
        {glint.path} · {learned ? "revisit" : "tap to find out"} →
      </p>
    </motion.button>
  );
}
