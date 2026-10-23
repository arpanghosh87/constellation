"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { learnerProfile, starsFor, useProgress, type StarLink } from "@/lib/progress";
import { CATEGORY_META, type AbVariant, type Lesson, type LessonEvent } from "@/lib/types";
import { latestThought } from "@/lib/buildProgress";
import { projectName } from "@/lib/debrief";
import { readNdjson } from "@/lib/ndjson";
import { extractStringField } from "@/lib/partialJson";
import { findSnippetLines, realFile, useWorkspace, type Glint } from "@/lib/workspace";
import { formatElapsed, useElapsed } from "./BuildProgress";
import { InlineCode } from "./InlineCode";

type Phase = "choose" | "guessing" | "loading" | "done" | "error";

const VERDICT = {
  nailed: { label: "Nailed it", className: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
  partial: { label: "On the right track", className: "bg-sky-400/15 text-sky-300 border-sky-400/30" },
  miss: { label: "Not quite", className: "bg-orange-400/15 text-orange-300 border-orange-400/30" },
} as const;

export function LessonDrawer() {
  const openGlintId = useWorkspace((s) => s.openGlintId);
  const glint = useWorkspace((s) => (s.openGlintId ? s.glints[s.openGlintId] : undefined));
  const close = () => useWorkspace.getState().openGlint(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AnimatePresence>
      {glint && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-30 bg-black/40"
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-label="Lesson"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[460px] flex-col border-l border-white/10 bg-panel shadow-2xl"
          >
            <LessonBody key={openGlintId} glint={glint} onClose={close} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function LessonBody({ glint, onClose }: { glint: Glint; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>(glint.lesson ? "done" : "choose");
  const [guess, setGuess] = useState("");
  const [error, setError] = useState("");
  const [earned, setEarned] = useState(0);
  const [burstNote, setBurstNote] = useState("");
  const [draft, setDraft] = useState("");
  const [thought, setThought] = useState("");
  const [loadingSince, setLoadingSince] = useState<number | null>(null);
  const award = useProgress((s) => s.award);

  // Requests belong to this open drawer: closing it cancels them.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchLesson = useCallback(
    async (userGuess: string | null) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase("loading");
      setError("");
      setDraft("");
      setThought("");
      setLoadingSince(Date.now());
      // Lessons explain the real code, never a naive B that happens to be swapped in.
      const fileContent = realFile(glint.path) ?? "";
      const progress = useProgress.getState();
      const learner = learnerProfile(
        progress.stars.filter((st) => st.id !== glint.id),
        progress.misconceptions,
      );
      try {
        const res = await fetch("/api/lesson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: glint.path,
            snippet: glint.snippet,
            fileContent: fileContent.slice(0, 60_000),
            title: glint.source === "glint" ? glint.title.slice(0, 200) : null,
            teaser: glint.source === "glint" ? glint.teaser.slice(0, 500) : null,
            guess: userGuess,
            // Claude's glints arrive already linked; ask-why lessons find their own links.
            learner: glint.source === "ask-why" ? { learned: learner.profile.learned, weakSpots: [] } : undefined,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Couldn't load the lesson.");
        }
        // The lesson streams in as JSON text; render it as it arrives.
        let lesson: Lesson | null = null;
        let buf = "";
        for await (const ev of readNdjson<LessonEvent>(res)) {
          if (ev.type === "thought") {
            setThought((t) => (t + ev.text).slice(-400));
          } else if (ev.type === "delta") {
            buf += ev.text;
            setDraft(buf);
          } else if (ev.type === "lesson") {
            lesson = ev.lesson;
          } else {
            throw new Error(ev.message);
          }
        }
        if (!lesson) throw new Error("Couldn't load the lesson.");
        // Another request may have finished first (or the glint is gone): keep the first answer.
        const current = useWorkspace.getState().glints[glint.id];
        if (!current) return;
        if (current.lesson) {
          setPhase("done");
          return;
        }

        // Links: what the build found, plus any the lesson found (ask-why).
        const links = glint.links.filter((l, i) => glint.links.findIndex((x) => x.to === l.to) === i);
        for (const b of lesson.buildsOn) {
          const to = learner.learnedRef[b.ref];
          if (to && to !== glint.id && !links.some((l) => l.to === to)) links.push({ to, why: b.why });
        }

        const ws = useWorkspace.getState();
        ws.patchGlint(glint.id, {
          lesson,
          links,
          status: "learned",
          category: lesson.category,
          concept: glint.concept || lesson.concept,
          title: glint.source === "ask-why" ? lesson.concept : glint.title,
        });

        // Misconception memory: log the gap, or settle a quiet re-test.
        const gotIt = lesson.verdict === "nailed";
        const missed = lesson.verdict === "partial" || lesson.verdict === "miss";
        if (glint.retestId && userGuess) {
          progress.resolveRetest(glint.retestId, glint.id, gotIt);
        } else if (missed && lesson.misconception && userGuess) {
          progress.addMisconception({
            id: glint.id,
            concept: glint.concept || lesson.concept,
            headline: lesson.headline,
            gap: lesson.misconception,
            guess: userGuess.slice(0, 500),
          });
        }

        const got = award({
          links,
          projectId: ws.projectId,
          projectName: projectName(ws.messages.find((m) => m.role === "user")?.text),
          id: glint.id,
          stars: starsFor(lesson.verdict),
          title: glint.source === "ask-why" ? lesson.concept : glint.title,
          concept: glint.concept || lesson.concept,
          category: lesson.category,
          path: glint.path,
          snippet: glint.snippet,
          lesson,
          verdict: lesson.verdict,
          source: glint.source,
        });
        const firstLink = links[0] && useProgress.getState().stars.find((st) => st.id === links[0].to);
        setBurstNote(
          glint.retestId && userGuess && gotIt
            ? "🌱 misconception cleared"
            : firstLink
              ? `🔗 linked to ${firstLink.concept}`
              : "",
        );
        setEarned(got);
        setPhase("done");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setPhase("error");
      }
    },
    [glint, award],
  );

  // User-initiated "why?" questions skip the choice and go straight to the answer.
  useEffect(() => {
    if (glint.source === "ask-why" && !glint.lesson) void fetchLesson(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = CATEGORY_META[glint.category];
  const lesson = glint.lesson;

  // Once a fair B exists, the A/B card shows the code, so skip the duplicate.
  const showSnippet = !(phase === "done" && glint.ab);

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: meta.color }}>
            {lesson || glint.source === "glint" ? meta.label : "Your question"}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-zinc-100">
            {lesson?.concept && glint.source === "ask-why" ? lesson.concept : glint.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close lesson"
          className="rounded-md px-2 py-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
        >
          ✕
        </button>
      </header>

      <div className="prose-code flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {showSnippet && <CodeBlock label={glint.path} code={glint.snippet} />}

        {glint.teaser && (
          <p className={phase === "done" ? "text-sm text-zinc-500" : "text-[15px] text-zinc-100"}>{glint.teaser}</p>
        )}

        {phase === "choose" && (
          <div className="grid grid-cols-2 gap-3">
            <ChoiceButton
              onClick={() => setPhase("guessing")}
              title="Let me guess first"
              detail="Up to +2 ★"
              primary
            />
            <ChoiceButton onClick={() => fetchLesson(null)} title="Tell me" detail="+1 ★" />
          </div>
        )}

        {phase === "guessing" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (guess.trim()) void fetchLesson(guess.trim());
            }}
            className="space-y-2"
          >
            <textarea
              autoFocus
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="My hunch is that it's there because…"
              className="w-full resize-none rounded-lg border border-white/10 bg-panel-2 p-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-star/50 focus:outline-none"
            />
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => {
                  setGuess("");
                  void fetchLesson(null);
                }}
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                No idea, just tell me
              </button>
              <button
                type="submit"
                disabled={!guess.trim()}
                className="rounded-lg bg-star px-4 py-1.5 text-sm font-semibold text-stone-900 disabled:opacity-30"
              >
                Check my guess
              </button>
            </div>
          </form>
        )}

        {phase === "loading" && (
          <DraftLesson
            buf={draft}
            thought={thought}
            color={meta.color}
            since={loadingSince}
            waitingLabel={guess ? "Reading your guess" : "Distilling the idea"}
          />
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>
            <button onClick={() => setPhase("choose")} className="text-sm text-zinc-400 hover:text-zinc-200">
              Try again
            </button>
          </div>
        )}

        {phase === "done" && lesson && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {lesson.verdict && <VerdictStrip lesson={lesson} />}
            <Flashcard lesson={lesson} color={meta.color} />
            <GrowthNotes glint={glint} />
            <BuildsOnRow links={glint.links} />
            <AbCard glint={glint} lesson={lesson} />
            <RatingRow glint={glint} lesson={lesson} />
          </motion.div>
        )}
      </div>

      <AnimatePresence>{earned > 0 && <StarBurst amount={earned} note={burstNote} onDone={() => setEarned(0)} />}</AnimatePresence>
    </div>
  );
}

/** Links to earlier concepts: the constellation lines, shown where they're made. */
function BuildsOnRow({ links }: { links: StarLink[] }) {
  const stars = useProgress((s) => s.stars);
  const linked = links.flatMap((l) => {
    const star = stars.find((st) => st.id === l.to);
    return star ? [{ star, why: l.why }] : [];
  });
  if (!linked.length) return null;
  return (
    <div className="rounded-2xl border border-star/25 bg-star/[0.04] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-star">🔗 Builds on what you know</p>
      <ul className="mt-2 space-y-2">
        {linked.map(({ star, why }) => (
          <li key={star.id}>
            <Link
              href={`/constellation?focus=${encodeURIComponent(star.id)}`}
              className="prose-code group flex items-start gap-2 text-sm"
            >
              <span>{star.lesson.emoji}</span>
              <span>
                <span className="font-medium text-zinc-100 group-hover:underline">{star.concept}</span>
                <span className="text-zinc-400"> · </span>
                <span className="text-zinc-400">
                  <InlineCode text={why} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The mentor's memory, made visible: a cleared misconception, or a gap it will revisit. */
function GrowthNotes({ glint }: { glint: Glint }) {
  const misconceptions = useProgress((s) => s.misconceptions);
  const cleared = misconceptions.find((m) => m.clearedBy === glint.id);
  const noted = misconceptions.find((m) => m.id === glint.id && m.status === "open");
  if (cleared) {
    return (
      <div className="prose-code rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4 text-sm">
        <p className="font-semibold text-emerald-300">🌱 You&apos;ve got it now</p>
        <p className="mt-1 text-zinc-300">
          Earlier ({cleared.concept}) the gap was: <InlineCode text={cleared.gap} /> This time you nailed it.
        </p>
      </div>
    );
  }
  if (noted) {
    return (
      <p className="prose-code text-xs text-zinc-500">
        📝 Noted: <InlineCode text={noted.gap} /> I&apos;ll check back on this in a later build.
      </p>
    );
  }
  return null;
}

function CodeBlock({ label, code, tone }: { label: string; code: string; tone?: "a" | "b" }) {
  const border =
    tone === "a" ? "border-emerald-400/30" : tone === "b" ? "border-rose-400/30" : "border-white/10";
  return (
    <pre className={`max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border ${border} bg-black/40 p-3 font-mono text-[12px] leading-5 text-zinc-300`}>
      <div className="mb-1 font-sans text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      {code}
    </pre>
  );
}

function ChoiceButton(props: { onClick: () => void; title: string; detail: string; primary?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-xl border px-4 py-3 text-left transition ${
        props.primary
          ? "border-star/40 bg-star/10 hover:bg-star/15"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
      }`}
    >
      <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
      <div className="mt-0.5 text-xs text-star">{props.detail}</div>
    </button>
  );
}

function VerdictStrip({ lesson }: { lesson: Lesson }) {
  const v = VERDICT[lesson.verdict!];
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${v.className}`}>
      <span className="shrink-0 font-semibold">{v.label}</span>
      {lesson.feedback && (
        <span className="text-zinc-200">
          <InlineCode text={lesson.feedback} />
        </span>
      )}
    </div>
  );
}

/** The thing we want remembered: one emoji, one rule, two one-liners. */
function Flashcard({ lesson, color }: { lesson: Lesson; color: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-5"
      style={{ borderColor: `${color}55`, background: `linear-gradient(135deg, ${color}1f, transparent 65%)` }}
    >
      <div className="flex items-start gap-4">
        <motion.span
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
          className="text-4xl leading-none"
        >
          {lesson.emoji}
        </motion.span>
        <p className="text-xl font-semibold leading-snug tracking-tight text-zinc-50">
          <InlineCode text={lesson.headline} />
        </p>
      </div>
      <dl className="mt-4 space-y-2 text-sm leading-relaxed">
        <div className="flex gap-2.5">
          <dt className="shrink-0" aria-label="Why">✅</dt>
          <dd className="text-zinc-300">
            <InlineCode text={lesson.why} />
          </dd>
        </div>
        <div className="flex gap-2.5">
          <dt className="shrink-0" aria-label="Without it">💥</dt>
          <dd className="text-zinc-300">
            <InlineCode text={lesson.breaks} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function AbCard({ glint, lesson }: { glint: Glint; lesson: Lesson }) {
  const abTest = useWorkspace((s) => s.abTest);
  // The real code (A), even while a B variant is swapped in.
  const realCode = useWorkspace((s) => (s.abTest?.path === glint.path ? s.abTest.original : s.files[glint.path]));
  const fileHasRegion = !!glint.ab && !!findSnippetLines(realCode, glint.ab.original);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState("");
  const active = abTest?.glintId === glint.id;

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setSince(Date.now());
    setError("");
    try {
      const res = await fetch("/api/ab", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: glint.path,
          snippet: glint.snippet,
          fileContent: (realFile(glint.path) ?? "").slice(0, 60_000),
          headline: lesson.headline.slice(0, 300),
          why: lesson.why.slice(0, 1000),
          breaks: lesson.breaks.slice(0, 1000),
        }),
      });
      const body = (await res.json()) as { ab?: AbVariant | null; reason?: string; error?: string };
      if (!res.ok || body.ab === undefined) throw new Error(body.error ?? "Couldn't build the experiment.");
      useWorkspace.getState().patchGlint(glint.id, { ab: body.ab, abReason: body.reason });
      setStatus("idle");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
      setStatus("error");
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-100">🔀 What if I hadn&apos;t?</p>
        {glint.ab && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
            ⏳ {glint.ab.minutesToObserve === 0 ? "see it instantly" : `~${glint.ab.minutesToObserve} min to see it`}
          </span>
        )}
      </div>

      {glint.ab === undefined && status !== "loading" && (
        <>
          <p className="mt-1 text-sm text-zinc-400">
            Run the naive version in your live preview and watch it fail for real.
          </p>
          <button
            onClick={generate}
            className="mt-3 w-full rounded-xl border border-rose-300/40 bg-rose-300/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-300/15"
          >
            Show me the naive way
          </button>
          {status === "error" && <p className="mt-2 text-xs text-red-300">{error}</p>}
        </>
      )}

      {status === "loading" && <AbLoading since={since} />}

      {glint.ab === null && (
        <p className="prose-code mt-2 text-sm text-zinc-400">
          No live demo for this one. <InlineCode text={glint.abReason ?? ""} />
        </p>
      )}

      {glint.ab && (
        <>
          <p className="prose-code mt-1 text-sm text-zinc-400">
            B <InlineCode text={glint.ab.whatChanged.replace(/^./, (c) => c.toLowerCase())} />
          </p>
          <div className="mt-3 space-y-2">
            <CodeBlock label="A · what I wrote" code={glint.ab.original} tone="a" />
            <CodeBlock label="B · the naive way" code={glint.ab.alternative} tone="b" />
          </div>
          <p className="prose-code mt-3 text-sm text-zinc-300">
            🧪 <InlineCode text={glint.ab.tryIt} />
          </p>
          {active ? (
            <p className="mt-3 text-sm text-star">A/B is running. Use the switcher at the bottom right.</p>
          ) : (
            <button
              disabled={!fileHasRegion}
              onClick={() => useWorkspace.getState().startAb(glint.id)}
              className="mt-3 w-full rounded-xl bg-rose-400/90 px-4 py-2.5 text-sm font-semibold text-stone-950 transition enabled:hover:bg-rose-300 disabled:opacity-40"
            >
              Swap in B and watch the preview →
            </button>
          )}
          {!fileHasRegion && !active && (
            <p className="mt-2 text-xs text-zinc-500">
              The code has changed since this experiment.{" "}
              <button
                onClick={() => {
                  useWorkspace.getState().patchGlint(glint.id, { ab: undefined, abReason: undefined });
                  void generate();
                }}
                className="font-semibold text-rose-200 hover:underline"
              >
                ↻ Regenerate B
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AbLoading({ since }: { since: number | null }) {
  const elapsed = useElapsed(since);
  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-300" />
      Writing a fair naive version and checking it compiles…
      <span className="font-mono text-xs text-zinc-600">{formatElapsed(elapsed)}</span>
    </div>
  );
}

/** Renders the lesson while its JSON is still streaming in. */
function DraftLesson(props: {
  buf: string;
  thought: string;
  color: string;
  since: number | null;
  waitingLabel: string;
}) {
  const elapsed = useElapsed(props.since);
  const field = (k: string) => extractStringField(props.buf, k);
  const verdict = field("verdict");
  const feedback = field("feedback");
  const emoji = field("emoji");
  const headline = field("headline");
  const why = field("why");
  const breaks = field("breaks");

  if (!props.buf) {
    return (
      <div className="flex items-start gap-3 py-6 text-sm text-zinc-400">
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="text-star"
        >
          ✦
        </motion.span>
        <div className="min-w-0">
          <p>
            {props.waitingLabel}… <span className="font-mono text-xs text-zinc-600">{formatElapsed(elapsed)}</span>
          </p>
          {latestThought(props.thought) && (
            <p className="mt-1.5 border-l-2 border-star/40 pl-2 text-xs italic leading-relaxed text-zinc-500">
              💭 {latestThought(props.thought)}
            </p>
          )}
        </div>
      </div>
    );
  }
  const verdictKey = verdict?.complete ? (verdict.value as keyof typeof VERDICT) : null;
  return (
    <div className="space-y-4">
      {verdictKey && VERDICT[verdictKey] && (
        <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${VERDICT[verdictKey].className}`}>
          <span className="shrink-0 font-semibold">{VERDICT[verdictKey].label}</span>
          <span className="text-zinc-200">
            <InlineCode text={feedback?.value ?? ""} />
          </span>
        </div>
      )}
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: `${props.color}55`, background: `linear-gradient(135deg, ${props.color}1f, transparent 65%)` }}
      >
        <div className="flex items-start gap-4">
          <span className="text-4xl leading-none">{emoji?.complete ? emoji.value : "✦"}</span>
          <p className="min-h-[1.75rem] text-xl font-semibold leading-snug tracking-tight text-zinc-50">
            <InlineCode text={headline?.value ?? ""} />
            {!headline?.complete && <Caret />}
          </p>
        </div>
        <dl className="mt-4 space-y-2 text-sm leading-relaxed">
          {why && (
            <div className="flex gap-2.5">
              <dt className="shrink-0">✅</dt>
              <dd className="text-zinc-300">
                <InlineCode text={why.value} />
                {!why.complete && <Caret />}
              </dd>
            </div>
          )}
          {breaks && (
            <div className="flex gap-2.5">
              <dt className="shrink-0">💥</dt>
              <dd className="text-zinc-300">
                <InlineCode text={breaks.value} />
                {!breaks.complete && <Caret />}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function Caret() {
  return <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-star align-[-0.15em]" />;
}

const DOWN_REASONS = ["Too obvious", "Confusing", "Not accurate", "Not useful"];

function RatingRow({ glint, lesson }: { glint: Glint; lesson: Lesson }) {
  const rating = useProgress((s) => s.ratings[glint.id]);
  const rate = useProgress((s) => s.rate);
  const [askReason, setAskReason] = useState(false);

  const send = (value: "up" | "down", reason: string | null) => {
    rate(glint.id, value, reason);
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        glintId: glint.id,
        rating: value,
        reason,
        concept: lesson.concept.slice(0, 200),
        category: lesson.category,
        headline: lesson.headline.slice(0, 300),
        source: glint.source,
      }),
    }).catch(() => {});
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4 text-sm">
      <span className="mr-1 text-zinc-400">Good learning?</span>
      {(["up", "down"] as const).map((v) => (
        <button
          key={v}
          aria-label={v === "up" ? "Thumbs up" : "Thumbs down"}
          aria-pressed={rating?.rating === v}
          onClick={() => {
            send(v, null);
            setAskReason(v === "down");
          }}
          className={`rounded-full border px-3 py-1 transition ${
            rating?.rating === v
              ? "border-star/60 bg-star/15"
              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"
          }`}
        >
          {v === "up" ? "👍" : "👎"}
        </button>
      ))}
      {askReason && rating?.rating === "down" && !rating.reason && (
        <div className="flex w-full flex-wrap gap-1.5 pt-1">
          {DOWN_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => {
                send("down", r);
                setAskReason(false);
              }}
              className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-zinc-400 hover:border-white/25 hover:text-zinc-200"
            >
              {r}
            </button>
          ))}
        </div>
      )}
      {rating && !(askReason && !rating.reason) && (
        <span className="text-xs text-zinc-500">Thanks, noted.</span>
      )}
    </div>
  );
}

function StarBurst({ amount, note, onDone }: { amount: number; note: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -40 }}
      className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center"
    >
      <div className="relative">
        {Array.from({ length: 10 }).map((_, i) => (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{
              x: Math.cos((i / 10) * Math.PI * 2) * 90,
              y: Math.sin((i / 10) * Math.PI * 2) * 90,
              opacity: 0,
            }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="absolute left-1/2 top-1/2 text-star"
          >
            ✦
          </motion.span>
        ))}
        <div className="rounded-full bg-star px-5 py-2 text-xl font-bold text-stone-900 shadow-[0_0_40px_rgba(250,204,21,0.7)]">
          +{amount} ★
        </div>
        {note && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-2 text-center text-sm font-semibold text-zinc-100 drop-shadow"
          >
            {note}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
