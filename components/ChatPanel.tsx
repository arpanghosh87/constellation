"use client";
import { useEffect, useRef, useState } from "react";
import { useWorkspace, type ChatMessage } from "@/lib/workspace";
import { BuildProgress, formatElapsed, useElapsed } from "./BuildProgress";
import { DebriefOfferCard } from "./Debrief";
import { FlowOfferCard } from "./FlowOfferCard";
import { useBuildProgress } from "@/lib/buildProgress";
import { GlintCard } from "./GlintCard";
import { RichText } from "./InlineCode";
import { useBuild } from "./useBuild";

const SUGGESTIONS = [
  "A pomodoro timer with a daily streak counter",
  "A notes app with search, saved in localStorage",
  "A tip calculator that splits the bill between friends",
  "A kanban board with drag-free buttons to move cards",
];

const BUSY_LABEL = {
  connecting: "Sending your request…",
  thinking: "Thinking…",
  writing: "Writing code…",
} as const;

export function ChatPanel({ width = 360 }: { width?: number | "full" }) {
  const messages = useWorkspace((s) => s.messages);
  const busy = useWorkspace((s) => s.busy);
  const { send, stop } = useBuild();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (text = draft) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setDraft("");
    void send(prompt);
  };

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-white/10 bg-panel"
      style={{ width: width === "full" ? "100%" : width }}
    >
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 && (
          <div className="pt-6">
            <h2 className="text-lg font-semibold text-zinc-100">What should we build?</h2>
            <p className="mt-1 text-sm text-zinc-400">
              I&apos;ll write the code. Now and then I&apos;ll point at something worth knowing.
              Look for the <span className="text-star">✦</span>.
            </p>
            <div className="mt-5 space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="block w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Message
            key={m.id}
            message={m}
            live={!!busy && i === messages.length - 1}
          />
        ))}
      </div>

      <div className="border-t border-white/10 p-3">
        {busy && (
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-star" />
              <BusyLabel fallback={BUSY_LABEL[busy]} />
            </span>
            <button onClick={stop} className="rounded px-2 py-0.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200">
              Stop
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-panel-2 p-2 focus-within:border-white/25">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={messages.length ? "Ask for a change…" : "Describe an app…"}
            className="max-h-40 flex-1 resize-none bg-transparent px-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            onClick={() => submit()}
            disabled={!draft.trim() || !!busy}
            aria-label="Send"
            className="rounded-lg bg-star px-3 py-1.5 text-sm font-semibold text-stone-900 transition enabled:hover:brightness-110 disabled:opacity-30"
          >
            ↑
          </button>
        </div>
      </div>
    </aside>
  );
}

function Message({ message, live }: { message: ChatMessage; live: boolean }) {
  if (message.role === "user") {
    return (
      <div className="ml-8 rounded-2xl rounded-br-sm bg-white/[0.07] px-3.5 py-2.5 text-sm text-zinc-100">
        {message.text}
      </div>
    );
  }

  const empty = !message.text && !message.files.length && !message.error && !message.note;
  return (
    <div className="text-sm leading-relaxed text-zinc-300">
      {live && (
        <div className="mb-2">
          <BuildProgress />
        </div>
      )}
      {empty && !live && <span className="text-zinc-500">…</span>}
      {message.text && <RichText text={message.text} />}
      {message.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.files.map((f) => (
            <button
              key={f}
              onClick={() => useWorkspace.getState().setActiveFile(f)}
              className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
            >
              {f}
            </button>
          ))}
        </div>
      )}
      {message.glintIds.map((id) => (
        <GlintCard key={id} id={id} />
      ))}
      {message.offerFlow && !live && <FlowOfferCard messageId={message.id} />}
      {!live && message.debriefOffered !== false && <RoundComplete message={message} />}
      {message.note && <p className="mt-2 text-xs text-zinc-500">↩︎ {message.note}</p>}
      {message.error && (
        <p className="mt-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-red-300">
          {message.error}
        </p>
      )}
    </div>
  );
}

function BusyLabel({ fallback }: { fallback: string }) {
  const startedAt = useBuildProgress((s) => s.startedAt);
  const active = useBuildProgress((s) => s.steps.findLast((p) => p.state === "active"));
  const elapsed = useElapsed(startedAt);
  return (
    <span>
      {active ? `${active.label}…` : fallback} <span className="font-mono text-zinc-600">{formatElapsed(elapsed)}</span>
    </span>
  );
}

/** When every glint from this reply is learned, offer the debrief. */
function RoundComplete({ message }: { message: ChatMessage }) {
  const done = useWorkspace(
    (s) =>
      message.glintIds.length > 0 &&
      message.glintIds.every((id) => s.glints[id]?.status === "learned") &&
      s.messages[s.messages.length - 1]?.id === message.id,
  );
  return done ? <DebriefOfferCard messageId={message.id} /> : null;
}
