"use client";
import {
  SandpackCodeEditor,
  SandpackFileExplorer,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react";
import type { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { findSnippetLines, useWorkspace } from "@/lib/workspace";
import { glintExtensions, setGlintRanges, type GlintRange } from "./glintExtension";
import { useAskWhy } from "./useAskWhy";
import { FlowView } from "./FlowView";
import { hashFiles } from "@/lib/hash";
import type { Pane } from "@/lib/workspace";
import type { LayoutMode } from "./useLayoutMode";

/** Matches /api/lesson's snippet limit. */
const MAX_ASK_WHY_CHARS = 4000;

type CodeMirrorRef = { getCodemirror: () => EditorView | undefined };

const theme = {
  colors: {
    surface1: "#0e0e17",
    surface2: "#151522",
    surface3: "#1e1e2e",
    clickable: "#8b8ba7",
    base: "#d4d4d8",
    disabled: "#4d4d63",
    hover: "#fafafa",
    accent: "#facc15",
    error: "#f87171",
    errorSurface: "#2a1215",
  },
  syntax: {
    plain: "#e4e4e7",
    comment: { color: "#6b6b85", fontStyle: "italic" as const },
    keyword: "#c4b5fd",
    tag: "#7dd3fc",
    punctuation: "#a1a1aa",
    definition: "#fde68a",
    property: "#93c5fd",
    static: "#fca5a5",
    string: "#86efac",
  },
  font: {
    body: "var(--font-geist-sans), system-ui, sans-serif",
    mono: "var(--font-geist-mono), ui-monospace, monospace",
    size: "13px",
    lineHeight: "20px",
  },
};

export default function CodePane({ mode, pane }: { mode: LayoutMode; pane: Pane }) {
  const projectKey = useWorkspace((s) => s.projectKey);
  // Sandpack takes initial files once; later changes flow through SyncBridge.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialFiles = useMemo(() => useWorkspace.getState().files, [projectKey]);

  return (
    <SandpackProvider
      key={projectKey}
      template="react"
      files={initialFiles}
      theme={theme}
      options={{
        activeFile: useWorkspace.getState().activeFile,
        visibleFiles: Object.keys(initialFiles),
        recompileMode: "delayed",
        recompileDelay: 600,
        // The editor would otherwise re-push every streamed chunk with
        // "update the preview" on. SyncBridge decides when the preview updates.
        autoReload: false,
      }}
      className="cst-sandpack"
    >
      <SyncBridge />
      {mode === "wide" ? (
        <div className="flex h-full min-h-0">
          <EditorColumn />
          <PreviewColumn showTabs />
        </div>
      ) : (
        // One pane at a time. Both stay mounted so the editor keeps its state
        // and the preview doesn't reload when switching tabs.
        <div className="relative h-full min-h-0">
          <div className={pane === "code" ? "flex h-full" : "invisible absolute inset-0 flex"}>
            <EditorColumn />
          </div>
          <div className={pane === "preview" || pane === "flow" ? "flex h-full" : "invisible absolute inset-0 flex"}>
            <PreviewColumn showTabs={false} />
          </div>
        </div>
      )}
    </SandpackProvider>
  );
}

/** Two-way sync between the zustand workspace (source of truth) and Sandpack. */
function SyncBridge() {
  const { sandpack } = useSandpack();
  const files = useWorkspace((s) => s.files);
  const activeFile = useWorkspace((s) => s.activeFile);
  const busy = useWorkspace((s) => s.busy);
  // Tab switch we asked Sandpack for and haven't seen land yet. Lets the
  // Sandpack -> Store direction tell our own switches apart from user clicks.
  const pushedActive = useRef<string | null>(null);

  // Store -> Sandpack: file contents. While Claude is streaming, update the
  // editor only; recompiling half-written files would just throw errors.
  const storePaths = useRef(new Set(Object.keys(files)));
  useEffect(() => {
    const live = !busy;
    for (const [path, code] of Object.entries(files)) {
      const existing = sandpack.files[path];
      if (!existing) sandpack.addFile(path, code, live);
      else if (existing.code !== code) sandpack.updateFile(path, code, live);
    }
    // Files removed from the store (e.g. a rolled-back new file) leave Sandpack too.
    for (const path of storePaths.current) {
      if (!(path in files) && sandpack.files[path]) sandpack.deleteFile(path, live);
    }
    storePaths.current = new Set(Object.keys(files));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Stream finished: push the complete project to the preview in one go.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) sandpack.updateFile(useWorkspace.getState().files, undefined, true);
    wasBusy.current = !!busy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Store -> Sandpack: active tab (re-checked as files appear in Sandpack)
  useEffect(() => {
    if (sandpack.activeFile !== activeFile && sandpack.files[activeFile]) {
      pushedActive.current = activeFile;
      sandpack.openFile(activeFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, sandpack.files]);

  // Sandpack -> Store: tab clicks by the user
  useEffect(() => {
    const path = sandpack.activeFile;
    if (pushedActive.current !== null) {
      if (path === pushedActive.current) pushedActive.current = null;
      return;
    }
    const ws = useWorkspace.getState();
    if (!ws.busy && ws.activeFile !== path) ws.setActiveFile(path);
  }, [sandpack.activeFile]);

  // Sandpack -> Store: edits typed by the user. Only react to files whose
  // Sandpack copy actually changed, so a stale snapshot can't clobber the store.
  const seenCode = useRef<Record<string, string>>({});
  useEffect(() => {
    const ws = useWorkspace.getState();
    for (const [path, file] of Object.entries(sandpack.files)) {
      const changed = seenCode.current[path] !== undefined && seenCode.current[path] !== file.code;
      seenCode.current[path] = file.code;
      if (!changed || busy || !(path in ws.files)) continue;
      if (ws.files[path] !== file.code) {
        ws.setFile(path, file.code);
        // autoReload is off, so a real user edit refreshes the preview here.
        sandpack.updateFile(path, file.code, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandpack.files, busy]);

  return null;
}

function EditorColumn() {
  const { sandpack } = useSandpack();
  const editorRef = useRef<CodeMirrorRef>(null);
  const [selection, setSelection] = useState("");
  const glints = useWorkspace((s) => s.glints);
  const files = useWorkspace((s) => s.files);
  const busy = useWorkspace((s) => s.busy);
  const streamingPath = useWorkspace((s) => s.streamingPath);
  const openGlint = useWorkspace((s) => s.openGlint);
  const abTest = useWorkspace((s) => s.abTest);
  const flowFocus = useWorkspace((s) => s.flowFocus);
  const flowFocusId = flowFocus ? `flow:${flowFocus.snippet}` : null;
  const focusId = useWorkspace((s) => s.openGlintId) ?? flowFocusId ?? abTest?.glintId ?? null;
  const scrolledTo = useRef<string | null>(null);
  const askWhy = useAskWhy();

  // Bumped whenever the editor's document changes (including Sandpack swapping
  // in new code), so highlights are recomputed against what's actually shown.
  const [docVersion, setDocVersion] = useState(0);
  const extensions = useMemo(
    () => glintExtensions(setSelection, () => setDocVersion((v) => v + 1)),
    [],
  );
  const path = sandpack.activeFile;
  const code = files[path];
  // A selection belongs to the file it was made in; drop it on tab switch.
  useEffect(() => setSelection(""), [path]);

  // Push glint ranges for the active file into the editor.
  useEffect(() => {
    const rangesFor = (doc: string): GlintRange[] => {
      const out: GlintRange[] = [];
      for (const g of Object.values(glints)) {
        if (g.path !== path) continue;
        const swapped = abTest?.glintId === g.id && abTest.mode === "B" && g.ab;
        const lines = findSnippetLines(doc, swapped ? g.ab!.alternative : g.snippet);
        if (!lines) continue;
        out.push({ id: g.id, ...lines, variant: swapped ? "b" : g.status === "learned" ? "learned" : "new" });
      }
      if (flowFocus && flowFocus.path === path) {
        const lines = findSnippetLines(doc, flowFocus.snippet);
        if (lines) out.unshift({ id: flowFocusId!, ...lines, variant: "flow" });
      }
      return out;
    };
    // Sandpack recreates the editor on tab switches, so retry for a few
    // frames until a live EditorView is available.
    let raf = 0;
    let tries = 0;
    const apply = () => {
      const ref = editorRef.current;
      const view = typeof ref?.getCodemirror === "function" ? ref.getCodemirror() : undefined;
      if (!view) {
        if (tries++ < 30) raf = requestAnimationFrame(apply);
        return;
      }
      const ranges = rangesFor(view.state.doc.toString());
      // Bring the focused glint (open lesson or live A/B) into view once.
      const focusRange = ranges.find((r) => r.id === focusId);
      const scrollKey = focusRange ? `${focusId}:${focusRange.variant}` : null;
      const effects: StateEffect<unknown>[] = [setGlintRanges.of(ranges)];
      if (focusRange && scrollKey !== scrolledTo.current) {
        scrolledTo.current = scrollKey;
        effects.push(EditorView.scrollIntoView(view.state.doc.line(focusRange.start).from, { y: "center" }));
      }
      view.dispatch({ effects });
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [glints, code, path, busy, abTest, focusId, docVersion, flowFocus, flowFocusId]);

  const trimmedSelection = selection.trim();

  return (
    <div
      className="relative flex min-w-[340px] flex-1 flex-col border-r border-white/10"
      onClick={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>("[data-glint-open]")?.dataset.glintOpen;
        if (id) openGlint(id);
      }}
    >
      <div className="flex min-h-0 flex-1">
        {/* The tab bar already lists files; the explorer only earns its space on very wide screens. */}
        <div className="hidden w-40 shrink-0 overflow-auto border-r border-white/10 bg-panel text-xs min-[1500px]:block">
          <SandpackFileExplorer autoHiddenFiles />
        </div>
        <div className="min-w-0 flex-1">
          <SandpackCodeEditor
            ref={editorRef}
            showTabs
            showLineNumbers
            wrapContent
            closableTabs={false}
            extensions={extensions}
            style={{ height: "100%" }}
          />
        </div>
      </div>

      <AnimatePresence>
        {trimmedSelection.length > 2 && !busy && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onMouseDown={(e) => e.preventDefault()}
            disabled={selection.length > MAX_ASK_WHY_CHARS}
            onClick={() => askWhy(path, selection)}
            className="absolute bottom-4 right-4 z-10 rounded-full bg-star px-4 py-2 text-sm font-semibold text-stone-900 shadow-[0_0_24px_rgba(250,204,21,0.45)] enabled:hover:brightness-110 disabled:bg-zinc-700 disabled:text-zinc-300 disabled:shadow-none"
          >
            {selection.length > MAX_ASK_WHY_CHARS
              ? "Select a smaller piece to ask why"
              : "✦ Why is it written this way?"}
          </motion.button>
        )}
      </AnimatePresence>

      {streamingPath && (
        <div className="pointer-events-none absolute right-4 top-12 rounded-full bg-black/60 px-3 py-1 font-mono text-xs text-star backdrop-blur">
          writing {streamingPath}…
        </div>
      )}
    </div>
  );
}

function PreviewColumn({ showTabs }: { showTabs: boolean }) {
  const busy = useWorkspace((s) => s.busy);
  const streamingPath = useWorkspace((s) => s.streamingPath);
  const tab = useWorkspace((s) => s.rightTab);
  const setTab = useWorkspace((s) => s.setRightTab);
  const flowStale = useWorkspace((s) => !!s.flow && s.flow.hash !== hashFiles(s.files));
  const hasFlow = useWorkspace((s) => !!s.flow);
  const writing = busy === "writing" || !!streamingPath;

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium transition ${
      active ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
    }`;

  return (
    <div className="flex min-w-[300px] flex-1 flex-col">
      {showTabs && (
        <div role="tablist" className="flex h-10 shrink-0 items-center gap-1 border-b border-white/10 bg-panel px-2">
          <button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={tabClass(tab === "preview")}>
            ▶ Preview
          </button>
          <button role="tab" aria-selected={tab === "flow"} onClick={() => setTab("flow")} className={tabClass(tab === "flow")}>
            🗺️ How it works
            {hasFlow && flowStale && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-star align-middle" />}
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {/* Keep the preview mounted so switching tabs doesn't reload the app. */}
        <div className={tab === "preview" ? "h-full" : "invisible absolute inset-0"}>
          <SandpackPreview style={{ height: "100%" }} showOpenInCodeSandbox={false} showRefreshButton />
        </div>
        {tab === "flow" && (
          <div className="absolute inset-0">
            <FlowView />
          </div>
        )}
        <AnimatePresence>
          {writing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 grid place-items-center bg-space/70 backdrop-blur-sm"
            >
              <div className="text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                  className="mx-auto mb-3 text-3xl text-star"
                >
                  ✦
                </motion.div>
                <p className="text-sm text-zinc-400">Building your app…</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
