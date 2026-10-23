"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BADGES, totalStars } from "@/lib/badges";
import {
  CLUSTER,
  MAP_H,
  MAP_W,
  clusterCenter,
  linkPath,
  placeStars,
  seeded,
  starEdges,
} from "@/lib/constellationLayout";
import { dayStreak, howEarned, useProgress, type StarRecord } from "@/lib/progress";
import { CATEGORIES, CATEGORY_META } from "@/lib/types";
import { InlineCode } from "./InlineCode";

const LAST_VISIT_KEY = "constellation-last-visit";
const PULSE_DURATION = 1.4;
const PULSE_GAP = 0.8;

type Pulse = { key: string; from: string; to: string; delay: number };

/** Stable per-star twinkle: same star, same rhythm, every visit. */
function twinkleFor(id: string) {
  const rand = seeded(`twinkle:${id}`);
  return { dur: +(2.8 + rand() * 3.4).toFixed(2), delay: -+(rand() * 6).toFixed(2) };
}

function TravelingPulse(props: { d: string; delay: number; onArrive: () => void; onDone: () => void }) {
  const motionRef = useRef<SVGAnimateMotionElement>(null);
  const [visible, setVisible] = useState(false);
  const { delay, onArrive, onDone } = props;
  useEffect(() => {
    const timers = [
      setTimeout(() => {
        setVisible(true);
        motionRef.current?.beginElement();
      }, delay * 1000),
      setTimeout(onArrive, (delay + PULSE_DURATION) * 1000),
      setTimeout(() => {
        setVisible(false);
        onDone();
      }, (delay + PULSE_DURATION + 0.15) * 1000),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <g style={{ opacity: visible ? 1 : 0 }} pointerEvents="none">
      <g>
        <circle r="8" fill="#facc15" opacity="0.35" filter="url(#glow)" />
        <circle r="3.5" fill="#fff" filter="url(#glow)" />
        <animateMotion
          ref={motionRef}
          dur={`${PULSE_DURATION}s`}
          begin="indefinite"
          fill="freeze"
          path={props.d}
          calcMode="spline"
          keyTimes="0;1"
          keyPoints="0;1"
          keySplines="0.45 0 0.25 1"
        />
      </g>
    </g>
  );
}

export default function ConstellationView() {
  const stars = useProgress((s) => s.stars);
  const earned = useProgress((s) => s.badges);
  const misconceptions = useProgress((s) => s.misconceptions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Deep link from a lesson: /constellation?focus=<starId>
  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (focus) setSelectedId(focus);
  }, []);


  const pos = useMemo(() => placeStars(stars), [stars]);
  const edges = useMemo(() => starEdges(stars), [stars]);
  const byId = useMemo(() => Object.fromEntries(stars.map((s) => [s.id, s])), [stars]);
  const degree = useMemo(() => {
    const d: Record<string, number> = {};
    for (const e of edges) {
      d[e.from] = (d[e.from] ?? 0) + 1;
      d[e.to] = (d[e.to] ?? 0) + 1;
    }
    return d;
  }, [edges]);

  // "New since last visit": read the previous visit once, then record this one.
  const [lastVisit] = useState<number | null>(() => Number(localStorage.getItem(LAST_VISIT_KEY)) || null);
  useEffect(() => localStorage.setItem(LAST_VISIT_KEY, String(Date.now())), []);
  const [reduceMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /** The few most recent stars earned since last visit (first visit: the latest 3), oldest first. */
  const freshStarOrder = useMemo(() => {
    const recent = [...stars].sort((a, b) => b.earnedAt - a.earnedAt);
    const fresh = lastVisit ? recent.filter((s) => s.earnedAt > lastVisit) : recent.slice(0, 3);
    return fresh.slice(0, 5).reverse().map((s) => s.id);
  }, [stars, lastVisit]);
  const freshEdges = useMemo(() => edges.filter((e) => freshStarOrder.includes(e.to)), [edges, freshStarOrder]);

  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [arrivals, setArrivals] = useState<Record<string, number>>({});
  // On open, every connection formed since last visit plays as an event.
  useEffect(() => {
    if (reduceMotion) return;
    setPulses(freshEdges.map((e, i) => ({ key: `fresh:${e.from}->${e.to}`, from: e.from, to: e.to, delay: 1.5 + i * PULSE_GAP })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Selecting a star replays the light along its own connections. */
  const select = (id: string) => {
    setSelectedId(id);
    if (reduceMotion) return;
    const mine = edges.filter((e) => e.to === id || e.from === id);
    const stamp = Date.now();
    setPulses((all) => [
      ...all,
      ...mine.map((e, i) => ({ key: `sel:${stamp}:${e.from}->${e.to}`, from: e.from, to: e.to, delay: 0.15 + i * 0.35 })),
    ]);
  };

  const focusId = hoverId ?? selectedId;
  const neighbors = useMemo(() => {
    if (!focusId) return null;
    const n = new Set([focusId]);
    for (const e of edges) {
      if (e.from === focusId) n.add(e.to);
      if (e.to === focusId) n.add(e.from);
    }
    return n;
  }, [focusId, edges]);

  const selected = selectedId ? byId[selectedId] : undefined;

  return (
    <div className="relative min-h-screen">
      <div className="starfield" />
      <div className="relative mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/build" className="text-sm text-zinc-400 hover:text-zinc-100">
            ← Back to building
          </Link>
          <div className="text-sm text-zinc-400">
            <span className="text-star">★</span> <span className="font-semibold text-zinc-100">{totalStars(stars)}</span>{" "}
            stars · {stars.length} concepts ·{" "}
            <span className="font-semibold text-zinc-100">{edges.length}</span> connections · 🔥 {dayStreak(stars)}-day
            streak · {earned.length}/{BADGES.length} badges
          </div>
        </header>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-zinc-50">Your constellation</h1>
        <p className="mt-1 text-zinc-400">
          Every concept you&apos;ve learned. Lines show where one idea builds on another: learning compounds.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            {hoverId && byId[hoverId] && (
              <StarHoverCard
                star={byId[hoverId]}
                at={pos[hoverId]}
                byId={byId}
                clearedGap={misconceptions.find((m) => m.clearedBy === hoverId)?.gap}
              />
            )}
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="h-auto w-full"
              onMouseLeave={() => setHoverId(null)}
              // Tapping empty sky dismisses the card (touch has no mouseleave).
              onClick={(e) => !(e.target as Element).closest("[data-star]") && setHoverId(null)}
            >
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#facc15" />
                </marker>
              </defs>

              {CATEGORIES.map((c) => {
                const { x, y } = clusterCenter(c);
                const meta = CATEGORY_META[c];
                const has = stars.some((s) => s.category === c);
                return (
                  <g key={c}>
                    <circle cx={x} cy={y} r={CLUSTER + 18} fill={meta.color} opacity={has ? 0.05 : 0.02} />
                    <text x={x} y={y + CLUSTER + 38} textAnchor="middle" fontSize="13" fill={meta.color} opacity={has ? 0.9 : 0.35}>
                      {meta.label}
                    </text>
                  </g>
                );
              })}

              {/* The lines: real "builds on" links, earlier concept -> later one. */}
              {edges.map((e) => {
                const lit = !neighbors || (neighbors.has(e.from) && neighbors.has(e.to));
                const freshIndex = freshEdges.indexOf(e);
                return (
                  <motion.path
                    key={`${e.from}->${e.to}`}
                    d={linkPath(pos[e.from], pos[e.to])}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth={lit && neighbors ? 2.2 : 1.4}
                    strokeOpacity={lit ? 0.75 : 0.12}
                    markerEnd="url(#arrow)"
                    filter="url(#glow)"
                    // New connections draw themselves in; the rest are already part of the sky.
                    initial={freshIndex >= 0 && !reduceMotion ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.1, delay: 0.4 + freshIndex * PULSE_GAP, ease: "easeInOut" }}
                  >
                    <title>{`${byId[e.from]?.concept} → ${byId[e.to]?.concept}: ${e.why}`}</title>
                  </motion.path>
                );
              })}

              {/* A dot of light travels from the older idea to the newer one. */}
              {pulses.map((p) => (
                <TravelingPulse
                  key={p.key}
                  d={linkPath(pos[p.from], pos[p.to])}
                  delay={p.delay}
                  onArrive={() => setArrivals((a) => ({ ...a, [p.to]: (a[p.to] ?? 0) + 1 }))}
                  onDone={() => setPulses((all) => all.filter((x) => x.key !== p.key))}
                />
              ))}

              {stars.map((s, i) => {
                const p = pos[s.id];
                const meta = CATEGORY_META[s.category];
                const lit = !neighbors || neighbors.has(s.id);
                const r = 3.5 + Math.min(degree[s.id] ?? 0, 4) * 1.2 + (s.stars > 1 ? 1 : 0);
                const tw = twinkleFor(s.id);
                const freshOrder = freshStarOrder.indexOf(s.id);
                return (
                  <motion.g
                    key={s.id}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: lit ? 1 : 0.25, scale: 1 }}
                    // Entrance is staggered; hover dimming must respond immediately.
                    transition={{ scale: { delay: 0.05 + i * 0.03, type: "spring" }, opacity: { duration: 0.2 } }}
                    style={{ transformOrigin: `${p.x}px ${p.y}px`, cursor: "pointer" }}
                    onClick={() => select(s.id)}
                    data-star={s.id}
                    onMouseEnter={() => setHoverId(s.id)}
                    onMouseLeave={() => setHoverId((h) => (h === s.id ? null : h))}
                  >
                    <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
                    {freshOrder >= 0 && (
                      <circle
                        className="star-ring pulse"
                        cx={p.x}
                        cy={p.y}
                        r={r}
                        fill="none"
                        stroke={meta.color}
                        strokeWidth={1.5}
                        style={{ "--pulse-delay": `${0.6 + freshOrder * 0.35}s` } as React.CSSProperties}
                      />
                    )}
                    {arrivals[s.id] && (
                      <circle
                        key={`arrive-${arrivals[s.id]}`}
                        className="star-ring pulse"
                        cx={p.x}
                        cy={p.y}
                        r={r}
                        fill="none"
                        stroke="#facc15"
                        strokeWidth={2}
                      />
                    )}
                    <circle
                      className={`star-core${selectedId === s.id ? "" : " twinkle"}`}
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill={selectedId === s.id ? "#fff" : meta.color}
                      filter="url(#glow)"
                      style={{ "--tw-dur": `${tw.dur}s`, "--tw-delay": `${tw.delay}s` } as React.CSSProperties}
                    />
                    {(focusId === s.id || (degree[s.id] ?? 0) >= 2) && (
                      <text x={p.x} y={p.y - r - 6} textAnchor="middle" fontSize="11" fill="#e4e4e7">
                        {s.concept}
                      </text>
                    )}
                  </motion.g>
                );
              })}

              {stars.length === 0 && (
                <text x={MAP_W / 2} y={MAP_H / 2} textAnchor="middle" fill="#71717a" fontSize="15">
                  Your sky is empty for now. Learn your first concept to light a star.
                </text>
              )}
              {stars.length > 1 && edges.length === 0 && (
                <text x={MAP_W / 2} y={MAP_H - 18} textAnchor="middle" fill="#71717a" fontSize="12">
                  Lines appear when a new concept builds on one you already know.
                </text>
              )}
            </svg>
          </div>

          <aside className="prose-code rounded-2xl border border-white/10 bg-panel/80 p-5 text-sm">
            {selected ? (
              <StarDetail star={selected} byId={byId} edges={edges} onSelect={select} />
            ) : (
              <ConceptList stars={stars} onSelect={select} onHover={setHoverId} />
            )}
          </aside>
        </div>

        <Growth misconceptions={misconceptions} />

        <h2 className="mt-12 text-xl font-semibold text-zinc-100">Badges</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {BADGES.map((b) => {
            const has = earned.includes(b.id);
            return (
              <div
                key={b.id}
                className={`rounded-xl border p-4 ${has ? "border-star/40 bg-star/[0.06]" : "border-white/10 bg-white/[0.02] opacity-50"}`}
              >
                <div className={`text-2xl ${has ? "" : "grayscale"}`}>{has ? b.icon : "🔒"}</div>
                <p className="mt-2 font-semibold text-zinc-100">{b.name}</p>
                <p className="text-xs text-zinc-400">{b.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Edge = ReturnType<typeof starEdges>[number];

function StarDetail(props: {
  star: StarRecord;
  byId: Record<string, StarRecord>;
  edges: Edge[];
  onSelect: (id: string) => void;
}) {
  const { star, byId, edges, onSelect } = props;
  const buildsOn = edges.filter((e) => e.to === star.id);
  const ledTo = edges.filter((e) => e.from === star.id);
  const meta = CATEGORY_META[star.category];
  return (
    <div className="space-y-4">
      <div>
        <button onClick={() => onSelect("")} className="mb-2 text-xs text-zinc-500 hover:text-zinc-300">
          ← All concepts
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
          {meta.label} · {"★".repeat(star.stars)}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-100">{star.concept}</h2>
        <p className="text-xs text-zinc-500">
          {new Date(star.earnedAt).toLocaleDateString()}
          {star.path && ` · ${star.path}`}
        </p>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <span className="text-3xl leading-none">{star.lesson.emoji}</span>
        <p className="text-base font-semibold leading-snug text-zinc-50">
          <InlineCode text={star.lesson.headline} />
        </p>
      </div>
      <p className="text-zinc-300">
        ✅ <InlineCode text={star.lesson.why} />
      </p>
      {star.lesson.breaks && (
        <p className="text-zinc-300">
          💥 <InlineCode text={star.lesson.breaks} />
        </p>
      )}
      <LinkList title="🔗 Builds on" items={buildsOn.map((e) => ({ star: byId[e.from], why: e.why }))} onSelect={onSelect} />
      <LinkList title="✨ Led to" items={ledTo.map((e) => ({ star: byId[e.to], why: e.why }))} onSelect={onSelect} />
    </div>
  );
}

function LinkList(props: { title: string; items: { star?: StarRecord; why: string }[]; onSelect: (id: string) => void }) {
  const items = props.items.filter((i): i is { star: StarRecord; why: string } => !!i.star);
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-star">{props.title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map(({ star, why }) => (
          <li key={star.id}>
            <button onClick={() => props.onSelect(star.id)} className="text-left hover:text-zinc-100">
              <span className="mr-1">{star.lesson.emoji}</span>
              <span className="font-medium text-zinc-200">{star.concept}</span>
              <span className="text-zinc-500"> · </span>
              <span className="text-zinc-400">
                <InlineCode text={why} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConceptList(props: {
  stars: StarRecord[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const { stars, onSelect, onHover } = props;
  return (
    <div className="text-zinc-400">
      <h2 className="font-semibold text-zinc-200">Concepts learned</h2>
      {stars.length === 0 ? (
        <p className="mt-2">Nothing yet. Head back and catch a ✦.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {[...stars].reverse().map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s.id)}
                onMouseEnter={() => onHover(s.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(s.id)}
                onBlur={() => onHover(null)}
                className="flex w-full items-center gap-2 text-left hover:text-zinc-100"
              >
                <span>{s.lesson.emoji}</span>
                <span className="flex-1 truncate" title={s.lesson.headline}>
                  {s.lesson.headline || s.concept}
                </span>
                {(s.links?.length ?? 0) > 0 && <span className="text-xs text-star/80">🔗{s.links.length}</span>}
                <span className="text-star">{"★".repeat(s.stars)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Growth({ misconceptions }: { misconceptions: ReturnType<typeof useProgress.getState>["misconceptions"] }) {
  if (!misconceptions.length) return null;
  const open = misconceptions.filter((m) => m.status === "open");
  const cleared = misconceptions.filter((m) => m.status === "cleared");
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold text-zinc-100">Growth</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Guesses that missed are remembered. A later build will quietly give you another shot at each one.
      </p>
      <div className="prose-code mt-4 grid gap-3 sm:grid-cols-2">
        {cleared.map((m) => (
          <div key={m.id} className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4 text-sm">
            <p className="font-semibold text-emerald-300">🌱 {m.concept}: cleared</p>
            <p className="mt-1 text-zinc-400">
              Was: <InlineCode text={m.gap} />
            </p>
          </div>
        ))}
        {open.map((m) => (
          <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
            <p className="font-semibold text-zinc-200">📝 {m.concept}: working on it</p>
            <p className="mt-1 text-zinc-400">
              <InlineCode text={m.gap} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "How did I get this one?" on hover. */
function StarHoverCard(props: {
  star: StarRecord;
  at: { x: number; y: number };
  byId: Record<string, StarRecord>;
  clearedGap?: string;
}) {
  const { star, at, byId, clearedGap } = props;
  const how = howEarned(star);
  const meta = CATEGORY_META[star.category];
  const left = Math.min(80, Math.max(20, (at.x / MAP_W) * 100));
  const top = (at.y / MAP_H) * 100;
  const below = top < 45;
  const buildsOn = star.links.map((l) => byId[l.to]).filter(Boolean);
  return (
    <motion.div
      key={star.id}
      initial={{ opacity: 0, y: below ? -4 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="prose-code pointer-events-none absolute z-10 w-72 -translate-x-1/2 rounded-xl border border-white/15 bg-panel-2/95 p-3 text-xs shadow-2xl backdrop-blur"
      style={{
        left: `${left}%`,
        top: below ? `calc(${top}% + 18px)` : undefined,
        bottom: below ? undefined : `calc(${100 - top}% + 18px)`,
      }}
    >
      <p className="flex items-start gap-2 text-sm font-semibold leading-snug text-zinc-50">
        <span>{star.lesson.emoji}</span>
        <InlineCode text={star.lesson.headline || star.concept} />
      </p>
      <p className="mt-1" style={{ color: meta.color }}>
        {star.concept} · {meta.label}
      </p>
      <div className="mt-2 space-y-1 border-t border-white/10 pt-2 text-zinc-300">
        <p>
          {how.icon} {how.text} <span className="text-star">{"★".repeat(star.stars)}</span>
        </p>
        {clearedGap && <p className="text-emerald-300">🌱 Cleared an old misconception</p>}
        {buildsOn.length > 0 && (
          <p className="text-star/90">🔗 Builds on {buildsOn.map((b) => b.concept).join(" + ")}</p>
        )}
        <p className="text-zinc-500">
          {star.projectName ? `While building ${star.projectName} · ` : ""}
          {new Date(star.earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </p>
      </div>
    </motion.div>
  );
}
