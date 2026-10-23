"use client";
import dynamic from "next/dynamic";

// Sandpack and localStorage-backed state are browser-only.
const Workspace = dynamic(() => import("@/components/Workspace"), {
  ssr: false,
  loading: () => (
    <div className="grid h-screen place-items-center text-zinc-500">
      <span className="animate-pulse text-2xl text-star">✦</span>
    </div>
  ),
});

export default function BuildPage() {
  return <Workspace />;
}
