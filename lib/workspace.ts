"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { swapInAlternative } from "./ab";
import { hashFiles } from "./hash";
import type { StarLink } from "./progress";
import { normalizeLesson, type AbVariant, type Flow, type GlintPayload, type Lesson, type MentorMode } from "./types";

export { findSnippetLines } from "./snippet";

const newId = () => Math.random().toString(36).slice(2, 10);

export const STARTER_FILES: Record<string, string> = {
  "/App.js": `export default function App() {
  return (
    <main className="empty">
      <h1>✦ Constellation</h1>
      <p>Describe something to build in the chat. It will appear here.</p>
    </main>
  );
}
`,
  "/styles.css": `html,
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0b0b14;
  color: #e4e4e7;
}

.empty {
  min-height: 100vh;
  display: grid;
  place-content: center;
  text-align: center;
  color: #8b8ba7;
}

.empty h1 {
  color: #facc15;
}
`,
};

export type Glint = Omit<GlintPayload, "buildsOn" | "retestOf"> & {
  /** Earlier stars this builds on (resolved from refs). */
  links: StarLink[];
  /** Misconception this glint quietly re-tests. Never shown to the user. */
  retestId: string | null;
  source: "glint" | "ask-why";
  status: "new" | "opened" | "learned";
  lesson?: Lesson;
  /** The fair "B" version: undefined = not generated yet, null = no fair B exists. */
  ab?: AbVariant | null;
  abReason?: string;
  createdAt: number;
};

/** A live A/B swap: B (the naive version) can be toggled into the preview. */
export type AbTest = {
  glintId: string;
  path: string;
  /** File content before the swap; restored exactly when going back to A. */
  original: string;
  alternateFile: string;
  mode: "A" | "B";
  /** The user typed into B; those edits are discarded when keeping A. */
  bEdited?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  files: string[];
  glintIds: string[];
  error?: string;
  /** Neutral status line under a reply (e.g. a rolled-back partial write). */
  note?: string;
  /** Offer a "how it works" map under this reply. */
  offerFlow?: boolean;
  /** false once the debrief offer under this reply was used or dismissed. */
  debriefOffered?: boolean;
};

export type Pane = "chat" | "code" | "preview" | "flow";

export type SavedFlow = { hash: string; data: Flow; walked: boolean };

type WorkspaceState = {
  files: Record<string, string>;
  activeFile: string;
  messages: ChatMessage[];
  glints: Record<string, Glint>;
  mentor: MentorMode;
  /** Glint currently open in the lesson drawer. */
  openGlintId: string | null;
  /** Transient (not persisted): what the build stream is doing right now. */
  busy: null | "connecting" | "thinking" | "writing";
  streamingPath: string | null;
  /** Bumped on New Project so the Sandpack provider remounts. */
  projectKey: number;
  /** Stable id + start time of the current project, for the debrief. */
  projectId: string;
  projectStartedAt: number;
  abTest: AbTest | null;
  flow: SavedFlow | null;
  flowStatus: "idle" | "loading" | "error";
  flowError: string;
  rightTab: "preview" | "flow";
  debriefOpen: boolean;
  setDebriefOpen: (open: boolean) => void;
  /** Which pane is showing in compact (tabbed) layouts. Transient. */
  pane: Pane;
  setPane: (pane: Pane) => void;
  /** Code the flow map is pointing at; the editor highlights it. */
  flowFocus: { path: string; snippet: string } | null;
  setRightTab: (tab: "preview" | "flow") => void;
  setFlowFocus: (focus: { path: string; snippet: string } | null) => void;
  generateFlow: () => Promise<void>;
  markFlowWalked: () => void;
  /** Start an A/B test for a glint and switch to B. Returns false if the code moved on. */
  startAb: (glintId: string) => boolean;
  setAbMode: (mode: "A" | "B") => void;
  /** Go back to A and end the test. */
  endAb: () => void;
  setBusy: (busy: WorkspaceState["busy"]) => void;
  setStreamingPath: (p: string | null) => void;
  setFile: (path: string, content: string) => void;
  removeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  addMessage: (m: ChatMessage) => void;
  patchMessage: (id: string, fn: (m: ChatMessage) => ChatMessage) => void;
  addGlint: (g: Glint) => void;
  patchGlint: (id: string, patch: Partial<Glint>) => void;
  setMentor: (m: MentorMode) => void;
  openGlint: (id: string | null) => void;
  newProject: () => void;
};

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      files: STARTER_FILES,
      activeFile: "/App.js",
      messages: [],
      glints: {},
      mentor: "subtle",
      openGlintId: null,
      busy: null,
      streamingPath: null,
      projectKey: 0,
      projectId: newId(),
      projectStartedAt: Date.now(),
      abTest: null,
      flow: null,
      flowStatus: "idle",
      flowError: "",
      rightTab: "preview",
      debriefOpen: false,
      setDebriefOpen: (debriefOpen) => set({ debriefOpen }),
      pane: "chat",
      flowFocus: null,
      setRightTab: (rightTab) =>
        set(rightTab === "preview" ? { rightTab, pane: rightTab, flowFocus: null } : { rightTab, pane: rightTab }),
      setPane: (pane) =>
        set(
          pane === "preview" || pane === "flow"
            ? { pane, rightTab: pane, ...(pane === "preview" ? { flowFocus: null } : {}) }
            : { pane },
        ),
      setFlowFocus: (flowFocus) =>
        set((st) => ({
          flowFocus,
          activeFile: flowFocus && st.files[flowFocus.path] !== undefined ? flowFocus.path : st.activeFile,
        })),
      generateFlow: async () => {
        if (get().flowStatus === "loading") return;
        // Map the real code, never a live B variant.
        get().endAb();
        const { files, projectId } = get();
        set({ flowStatus: "loading", flowError: "" });
        try {
          const res = await fetch("/api/flow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files }),
          });
          // A gateway timeout returns an HTML page, not JSON.
          const body = (await res.json().catch(() => ({}))) as { flow?: Flow; error?: string };
          if (!res.ok || !body.flow) {
            throw new Error(body.error ?? (res.status === 504 ? "Mapping took too long. Try again." : "Couldn't map this app."));
          }
          // The user started a new project while this was in flight: it isn't theirs anymore.
          if (get().projectId !== projectId) return;
          set({ flow: { hash: hashFiles(files), data: body.flow, walked: false }, flowStatus: "idle" });
        } catch (e) {
          if (get().projectId !== projectId) return;
          set({ flowStatus: "error", flowError: (e as Error).message });
        }
      },
      markFlowWalked: () => set((st) => (st.flow ? { flow: { ...st.flow, walked: true } } : st)),
      startAb: (glintId) => {
        const s = get();
        if (s.abTest) s.endAb();
        const g = get().glints[glintId];
        const original = g && get().files[g.path];
        if (!g?.ab || original === undefined) return false;
        const alternateFile = swapInAlternative(original, g.ab.original, g.ab.alternative);
        if (alternateFile === null) return false;
        set((st) => ({
          abTest: { glintId, path: g.path, original, alternateFile, mode: "B" },
          files: { ...st.files, [g.path]: alternateFile },
          activeFile: g.path,
          openGlintId: null,
          // Compact layouts: show the running app, that's where B is visible.
          pane: "preview",
          rightTab: "preview",
        }));
        return true;
      },
      setAbMode: (mode) =>
        set((st) => {
          if (!st.abTest || st.abTest.mode === mode) return st;
          const content = mode === "A" ? st.abTest.original : st.abTest.alternateFile;
          return { abTest: { ...st.abTest, mode }, files: { ...st.files, [st.abTest.path]: content } };
        }),
      endAb: () =>
        set((st) => {
          if (!st.abTest) return st;
          if (st.abTest.mode === "A") return { abTest: null };
          return { abTest: null, files: { ...st.files, [st.abTest.path]: st.abTest.original } };
        }),
      setBusy: (busy) => set({ busy }),
      setStreamingPath: (streamingPath) => set({ streamingPath }),
      setFile: (path, content) =>
        set((s) => {
          const files = { ...s.files, [path]: content };
          const ab = s.abTest;
          if (!ab || ab.path !== path) return { files };
          // Edits during an A/B test belong to the side being shown, so switching keeps them.
          return {
            files,
            abTest:
              ab.mode === "B"
                ? { ...ab, alternateFile: content, bEdited: ab.bEdited || content !== ab.alternateFile }
                : { ...ab, original: content },
          };
        }),
      removeFile: (path) =>
        set((s) => {
          if (!(path in s.files)) return s;
          const files = { ...s.files };
          delete files[path];
          return { files, activeFile: s.activeFile === path ? "/App.js" : s.activeFile };
        }),
      setActiveFile: (activeFile) => set({ activeFile }),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      patchMessage: (id, fn) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) })),
      addGlint: (g) => set((s) => ({ glints: { ...s.glints, [g.id]: g } })),
      patchGlint: (id, patch) =>
        set((s) => (s.glints[id] ? { glints: { ...s.glints, [id]: { ...s.glints[id], ...patch } } } : s)),
      setMentor: (mentor) => set({ mentor }),
      openGlint: (openGlintId) =>
        set((s) => {
          const g = openGlintId ? s.glints[openGlintId] : undefined;
          if (!g) return { openGlintId };
          // Show the highlighted code behind the drawer.
          const activeFile = s.files[g.path] !== undefined ? g.path : s.activeFile;
          const glints =
            g.status === "new" ? { ...s.glints, [g.id]: { ...g, status: "opened" as const } } : s.glints;
          return { openGlintId, activeFile, glints, pane: s.pane === "chat" ? s.pane : "code" };
        }),
      newProject: () =>
        set((s) => ({
          files: STARTER_FILES,
          activeFile: "/App.js",
          messages: [],
          glints: {},
          openGlintId: null,
          abTest: null,
          flow: null,
          flowStatus: "idle",
          flowError: "",
          flowFocus: null,
          rightTab: "preview",
          pane: "chat",
          busy: null,
          streamingPath: null,
          projectKey: s.projectKey + 1,
          projectId: newId(),
          projectStartedAt: Date.now(),
        })),
    }),
    {
      name: "constellation-workspace",
      version: 4,
      migrate: (state) => {
        // v3: lessons no longer embed an A/B variant (old ones could be unfair);
        // B is regenerated on demand and stored on the glint.
        // v4: glints carry concept links and re-test targets; projects get ids.
        const s = state as { glints?: Record<string, Glint>; projectId?: string; projectStartedAt?: number };
        for (const g of Object.values(s.glints ?? {})) {
          if (g.lesson) g.lesson = normalizeLesson(g.lesson);
          g.links ??= [];
          g.retestId ??= null;
        }
        s.projectId ??= newId();
        s.projectStartedAt ??= Date.now();
        return state as WorkspaceState;
      },
      partialize: ({ files, activeFile, messages, glints, mentor, abTest, flow, projectId, projectStartedAt }) => ({
        projectId,
        projectStartedAt,
        abTest,
        flow,
        files,
        activeFile,
        messages,
        glints,
        mentor,
      }),
    },
  ),
);

/** The real code for a path: version A while a naive B variant is swapped in. */
export function realFile(path: string): string | undefined {
  const { abTest, files } = useWorkspace.getState();
  return abTest && abTest.path === path ? abTest.original : files[path];
}

