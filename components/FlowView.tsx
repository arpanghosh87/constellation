"use client";
import dagre from "@dagrejs/dagre";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { projectName } from "@/lib/debrief";
import { hashFiles } from "@/lib/hash";
import { useProgress } from "@/lib/progress";
import type { Flow, FlowEdgeKind, FlowNode, FlowNodeKind } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { InlineCode } from "./InlineCode";

const NODE_W = 220;
const NODE_H = 84;

export const KIND_META: Record<FlowNodeKind, { icon: string; color: string; label: string }> = {
  user: { icon: "🧑", color: "#facc15", label: "You" },
  component: { icon: "🧩", color: "#7dd3fc", label: "Component" },
  state: { icon: "📦", color: "#c084fc", label: "State" },
  effect: { icon: "⚡", color: "#fb923c", label: "Effect" },
  handler: { icon: "👆", color: "#4ade80", label: "Handler" },
  function: { icon: "ƒ", color: "#94a3b8", label: "Function" },
  storage: { icon: "💾", color: "#f472b6", label: "Storage" },
  external: { icon: "🌐", color: "#38bdf8", label: "Browser API" },
};

const EDGE_STYLE: Record<FlowEdgeKind, { dash?: string; color: string }> = {
  event: { color: "#4ade80", dash: "6 4" },
  data: { color: "#c084fc" },
  render: { color: "#7dd3fc", dash: "2 4" },
  call: { color: "#94a3b8" },
};

type FlowNodeData = { node: FlowNode; active: boolean; dim: boolean };
type FlowEdgeData = { label: string; kind: FlowEdgeKind; active: boolean; dim: boolean };

function layout(flow: Flow) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 56, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of flow.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of flow.edges) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const pos: Record<string, { x: number; y: number }> = {};
  for (const n of flow.nodes) {
    const p = g.node(n.id);
    pos[n.id] = { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
  }
  return pos;
}

function FlowNodeCard({ data }: NodeProps<Node<FlowNodeData>>) {
  const meta = KIND_META[data.node.kind];
  return (
    <div
      className="prose-code rounded-xl border bg-panel-2 px-3 py-2 transition-all duration-300"
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        borderColor: data.active ? meta.color : `${meta.color}55`,
        boxShadow: data.active ? `0 0 0 2px ${meta.color}, 0 0 28px ${meta.color}66` : "none",
        opacity: data.dim ? 0.3 : 1,
        transform: data.active ? "scale(1.04)" : "none",
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-zinc-600" />
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{meta.icon}</span>
        <span className="truncate font-mono text-[15px] font-semibold text-zinc-50">{data.node.label}</span>
        <span className="ml-auto text-[9px] font-medium uppercase tracking-wider" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-zinc-400">
        <InlineCode text={data.node.detail} />
      </p>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-zinc-600" />
    </div>
  );
}

function FlowEdgeLine(props: EdgeProps<Edge<FlowEdgeData>>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const style = EDGE_STYLE[data.kind];
  const color = data.active ? "#facc15" : style.color;
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: data.active ? 2.5 : 1.4,
          strokeDasharray: data.active ? undefined : style.dash,
          opacity: data.dim ? 0.2 : 0.85,
          transition: "opacity 300ms",
        }}
      />
      {data.active && (
        <circle r="5" fill="#facc15" style={{ filter: "drop-shadow(0 0 6px #facc15)" }}>
          <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
        </circle>
      )}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute rounded-md px-1.5 py-0.5 text-[12px] font-medium"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: data.active ? "#facc15" : "#0e0e17",
            color: data.active ? "#1c1917" : "#a1a1aa",
            opacity: data.dim ? 0.25 : 1,
            border: data.active ? "none" : "1px solid rgb(255 255 255 / 0.08)",
          }}
        >
          {data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { flowNode: FlowNodeCard };
const edgeTypes = { flowEdge: FlowEdgeLine };

export function FlowView() {
  return (
    <ReactFlowProvider>
      <FlowPanel />
    </ReactFlowProvider>
  );
}

function FlowPanel() {
  const flow = useWorkspace((s) => s.flow);
  const status = useWorkspace((s) => s.flowStatus);
  const error = useWorkspace((s) => s.flowError);
  const files = useWorkspace((s) => s.files);
  const hasBuilt = useWorkspace((s) => s.messages.some((m) => m.files.length > 0));
  const busy = useWorkspace((s) => s.busy);
  const generate = useWorkspace((s) => s.generateFlow);

  const stale = !!flow && flow.hash !== hashFiles(files);

  if (status === "loading") return <Mapping />;
  if (!flow) {
    return (
      <EmptyState
        canGenerate={hasBuilt && !busy}
        error={status === "error" ? error : ""}
        onGenerate={() => void generate()}
      />
    );
  }
  return <FlowCanvas key={flow.hash} flow={flow.data} walked={flow.walked} stale={stale} />;
}

function FlowCanvas({ flow, walked, stale }: { flow: Flow; walked: boolean; stale: boolean }) {
  const [step, setStep] = useState(-1);
  const [earned, setEarned] = useState(false);
  const busy = useWorkspace((s) => s.busy);
  const status = useWorkspace((s) => s.flowStatus);
  const flowError = useWorkspace((s) => s.flowError);
  const { setFlowFocus, generateFlow, markFlowWalked } = useWorkspace.getState();
  const award = useProgress((s) => s.award);

  const positions = useMemo(() => layout(flow), [flow]);
  const current = step >= 0 ? flow.steps[step] : null;
  const byId = useMemo(() => Object.fromEntries(flow.nodes.map((n) => [n.id, n])), [flow]);

  const focusNode = useCallback(
    (id: string) => {
      const n = byId[id];
      if (n && !stale) setFlowFocus({ path: n.path, snippet: n.snippet });
    },
    [byId, stale, setFlowFocus],
  );

  // The editor follows the story: highlight the code for where each step lands.
  useEffect(() => {
    if (current) focusNode(current.to);
  }, [current, focusNode]);

  // So does the camera: zoom to the two boxes in this step, or back out to the whole map.
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => {
      if (current) {
        void fitView({ nodes: [{ id: current.from }, { id: current.to }], duration: 600, padding: 0.35, maxZoom: 1.3 });
      } else {
        void fitView({ duration: 600, padding: 0.08 });
      }
    }, 30);
    return () => clearTimeout(t);
  }, [current, fitView]);

  const go = useCallback(
    (next: number) => {
      if (next >= flow.steps.length) {
        setStep(-1);
        if (!walked) {
          markFlowWalked();
          const got = award({
            // One flow star per project: re-mapping after an edit shouldn't mint another.
            id: `flow-${useWorkspace.getState().projectId}`,
            stars: 1,
            title: flow.title,
            concept: "Data flow",
            category: "architecture",
            path: "",
            snippet: "",
            lesson: {
              verdict: null,
              feedback: null,
              emoji: "🗺️",
              headline: flow.takeaway,
              why: flow.title,
              breaks: "",
              category: "architecture",
              concept: "Data flow",
              misconception: null,
              buildsOn: [],
            },
            projectId: useWorkspace.getState().projectId,
            projectName: projectName(useWorkspace.getState().messages.find((m) => m.role === "user")?.text),
            verdict: null,
            source: "flow",
          });
          if (got) setEarned(true);
        }
        return;
      }
      setStep(Math.max(0, next));
    },
    [flow, walked, award, markFlowWalked],
  );

  useEffect(() => {
    if (step < 0) return;
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys belong to whatever the user is typing in, and a lesson drawer owns Escape.
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest(".cm-editor"));
      if (typing || useWorkspace.getState().openGlintId || e.defaultPrevented) return;
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
      if (e.key === "Escape") setStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go]);

  const nodes: Node<FlowNodeData>[] = flow.nodes.map((n) => {
    const active = !!current && (current.from === n.id || current.to === n.id);
    return {
      id: n.id,
      type: "flowNode",
      position: positions[n.id],
      data: { node: n, active, dim: !!current && !active },
      draggable: false,
    };
  });
  const edges: Edge<FlowEdgeData>[] = flow.edges.map((e) => {
    const active = !!current && current.from === e.from && current.to === e.to;
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "flowEdge",
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? "#facc15" : EDGE_STYLE[e.kind].color, width: 16, height: 16 },
      data: { label: e.label, kind: e.kind, active, dim: !!current && !active },
    };
  });

  return (
    <div className="relative flex h-full flex-col bg-space">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">🗺️ {flow.title}</p>
        <p className="prose-code mt-1 text-base font-semibold leading-snug text-zinc-50">
          💡 <InlineCode text={flow.takeaway} />
        </p>
        {status === "error" && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs text-red-200">
            <span>Couldn&apos;t update the map: {flowError}</span>
            <button onClick={() => void generateFlow()} disabled={!!busy} className="font-semibold hover:underline disabled:opacity-40">
              Try again
            </button>
          </div>
        )}
        {stale && status !== "error" && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-star/30 bg-star/[0.06] px-3 py-1.5 text-xs text-zinc-300">
            <span>The code changed since this map was drawn.</span>
            <button
              disabled={!!busy || status === "loading"}
              onClick={() => void generateFlow()}
              className="font-semibold text-star hover:brightness-110 disabled:opacity-40"
            >
              ↻ Update map
            </button>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, n) => focusNode(n.id)}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.3}
          maxZoom={1.5}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          style={{ background: "transparent" }}
        />
        {!current && <Legend />}
      </div>

      <div className="border-t border-white/10 bg-panel px-4 py-3">
        {current ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => go(step - 1)}
              disabled={step === 0}
              aria-label="Previous step"
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-zinc-300 hover:bg-white/5 disabled:opacity-30"
            >
              ←
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-star">
                Step {step + 1} of {flow.steps.length}
              </p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={step}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="prose-code text-sm text-zinc-100"
                >
                  <InlineCode text={current.text} />
                </motion.p>
              </AnimatePresence>
            </div>
            <button
              onClick={() => go(step + 1)}
              className="rounded-lg bg-star px-3 py-1.5 text-sm font-semibold text-stone-900 hover:brightness-110"
            >
              {step === flow.steps.length - 1 ? (walked ? "Done ✓" : "Finish +1 ★") : "Next →"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              {walked ? "★ You've walked this flow. Click any box to see its code." : "Click any box to jump to its code."}
            </p>
            {flow.steps.length > 0 && (
              <button
                onClick={() => go(0)}
                className="rounded-lg bg-star px-3 py-1.5 text-sm font-semibold text-stone-900 hover:brightness-110"
              >
                ▶ Walk me through it{walked ? "" : " · +1 ★"}
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {earned && <FlowStarToast onDone={() => setEarned(false)} />}
      </AnimatePresence>
    </div>
  );
}

function Legend() {
  const kinds: FlowNodeKind[] = ["user", "handler", "state", "effect", "component", "storage"];
  return (
    <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-space/80 px-2 py-1 text-[10px] text-zinc-500 backdrop-blur">
      {kinds.map((k) => (
        <span key={k}>
          {KIND_META[k].icon} {KIND_META[k].label}
        </span>
      ))}
    </div>
  );
}

function FlowStarToast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -30 }}
      className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center"
    >
      <div className="rounded-full bg-star px-5 py-2 text-lg font-bold text-stone-900 shadow-[0_0_40px_rgba(250,204,21,0.7)]">
        +1 ★ Flow mastered
      </div>
    </motion.div>
  );
}

function Mapping() {
  return (
    <div className="grid h-full place-items-center bg-space">
      <div className="text-center">
        <div className="relative mx-auto h-16 w-40">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute top-6 h-3 w-3 rounded-full bg-star"
              style={{ left: `${i * 60 + 10}px` }}
              animate={{ scale: [1, 1.6, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.25 }}
            />
          ))}
          <div className="absolute left-4 right-4 top-[29px] h-px bg-gradient-to-r from-star/0 via-star/50 to-star/0" />
        </div>
        <p className="text-sm text-zinc-300">Mapping how your app works…</p>
        <p className="mt-1 text-xs text-zinc-500">Tracing clicks, state, effects and storage</p>
      </div>
    </div>
  );
}

function EmptyState({ canGenerate, error, onGenerate }: { canGenerate: boolean; error: string; onGenerate: () => void }) {
  return (
    <div className="grid h-full place-items-center bg-space px-8">
      <div className="max-w-sm text-center">
        <div className="text-4xl">🗺️</div>
        <h3 className="mt-3 text-lg font-semibold text-zinc-100">See how this app works</h3>
        <p className="mt-1 text-sm text-zinc-400">
          A one-minute map of the data flow: what you click, what changes, what redraws, what gets saved.
          Walk through it step by step while the code highlights alongside.
        </p>
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="mt-5 rounded-full bg-star px-5 py-2 text-sm font-semibold text-stone-900 hover:brightness-110 disabled:opacity-30"
        >
          Map my app
        </button>
        {!canGenerate && <p className="mt-2 text-xs text-zinc-500">Build something first.</p>}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
