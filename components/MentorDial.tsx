"use client";
import type { MentorMode } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

const MODES: { id: MentorMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Just build. No mentor moments." },
  { id: "subtle", label: "Subtle", hint: "At most one glint per response." },
  { id: "curious", label: "Curious", hint: "Up to three glints per response." },
];

export function MentorDial() {
  const mentor = useWorkspace((s) => s.mentor);
  const setMentor = useWorkspace((s) => s.setMentor);

  return (
    <div role="radiogroup" aria-label="Mentor intensity" className="flex items-center gap-2 text-xs">
      <span className="hidden text-zinc-500 lg:inline">Mentor</span>
      <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mentor === m.id}
            title={m.hint}
            onClick={() => setMentor(m.id)}
            className={`rounded-full px-2 py-1 transition sm:px-2.5 ${
              mentor === m.id ? "bg-white/15 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
