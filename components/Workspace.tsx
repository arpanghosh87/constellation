"use client";
import Link from "next/link";
import { useWorkspace, type Pane } from "@/lib/workspace";
import { NewProjectButton } from "./NewProjectButton";
import { useLayoutMode, type LayoutMode } from "./useLayoutMode";
import { AbBar } from "./AbBar";
import { BadgeToasts } from "./BadgeToasts";
import { DebriefModal } from "./Debrief";
import { ChatPanel } from "./ChatPanel";
import CodePane from "./CodePane";
import { GlintsTray } from "./GlintsTray";
import { LessonDrawer } from "./LessonDrawer";
import { MentorDial } from "./MentorDial";
import { StarCounter } from "./StarCounter";

export default function Workspace() {
  const mode = useLayoutMode();
  const pane = useWorkspace((s) => s.pane);
  // Medium layouts always show chat, so "chat" means the default right-hand view.
  const effectivePane: Pane = mode === "medium" && pane === "chat" ? "preview" : pane;
  const showChat = mode !== "narrow" || effectivePane === "chat";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-space px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-100">
            <span className="text-star">✦</span> <span className="hidden sm:inline">Constellation</span>
          </Link>
          <NewProjectButton />
          <button
            onClick={() => useWorkspace.getState().setDebriefOpen(true)}
            title="Debrief: what you built and learned"
            className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            🏁 <span className="hidden sm:inline">Wrap up</span>
          </button>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <MentorDial />
          <GlintsTray />
          <StarCounter />
        </div>
      </header>
      {mode !== "wide" && <PaneTabs mode={mode} active={effectivePane} />}
      <div className="relative flex min-h-0 flex-1">
        <div
          className={
            showChat
              ? mode === "narrow"
                ? "flex min-w-0 flex-1"
                : "flex shrink-0"
              : "invisible absolute inset-0"
          }
        >
          <ChatPanel width={mode === "narrow" ? "full" : mode === "medium" ? 320 : 360} />
        </div>
        <main
          className={
            mode === "narrow" && effectivePane === "chat" ? "invisible absolute inset-0" : "relative min-w-0 flex-1"
          }
        >
          <CodePane mode={mode} pane={effectivePane} />
        </main>
      </div>
      <LessonDrawer />
      <AbBar />
      <BadgeToasts />
      <DebriefModal />
    </div>
  );
}

function PaneTabs({ mode, active }: { mode: LayoutMode; active: Pane }) {
  const setPane = useWorkspace((s) => s.setPane);
  const unseenGlints = useWorkspace((s) => Object.values(s.glints).some((g) => g.status === "new"));
  const tabs: { id: Pane; label: string }[] = [
    ...(mode === "narrow" ? [{ id: "chat" as const, label: "💬 Chat" }] : []),
    { id: "code", label: "⌨️ Code" },
    { id: "preview", label: "▶ Preview" },
    { id: "flow", label: "🗺️ How it works" },
  ];
  return (
    <div role="tablist" className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 bg-panel px-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => setPane(t.id)}
          className={`relative shrink-0 rounded-md px-3 py-1 text-xs font-medium transition ${
            active === t.id ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {t.label}
          {t.id === "chat" && active !== "chat" && unseenGlints && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-star" />
          )}
        </button>
      ))}
    </div>
  );
}
