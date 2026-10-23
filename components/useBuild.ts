"use client";
import { useCallback } from "react";
import { useBuildProgress } from "@/lib/buildProgress";
import { readNdjson } from "@/lib/ndjson";
import { learnerProfile, useProgress } from "@/lib/progress";
import type { BuildEvent } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

const HISTORY_TURNS = 10;

const kb = (s: string) => `${(s.length / 1024).toFixed(1)} KB`;

const uid = () => Math.random().toString(36).slice(2, 10);

// Module-level so any control (Stop, New project) can cancel the running build.
let activeBuild: AbortController | null = null;

export function stopBuild() {
  activeBuild?.abort();
}

export function useBuild() {
  const send = useCallback(async (prompt: string) => {
    if (useWorkspace.getState().busy) return;
    // Never send the naive B variant to Claude as the real code.
    useWorkspace.getState().endAb();
    const ws = useWorkspace.getState();

    const history = ws.messages
      .filter((m) => m.text.trim())
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 4000) }));

    const assistantId = uid();
    ws.addMessage({ id: uid(), role: "user", text: prompt, files: [], glintIds: [] });
    ws.addMessage({ id: assistantId, role: "assistant", text: "", files: [], glintIds: [] });
    ws.setBusy("connecting");
    // Read fresh each time; the store changes as events arrive.
    const progress = () => useBuildProgress.getState();
    progress().start();
    let glintCount = 0;
    // Compact layouts: watch the code being written.
    if (ws.pane === "preview" || ws.pane === "flow") ws.setPane("code");

    const patch = ws.patchMessage;
    const fail = (error: string) => {
      reportedError = true;
      patch(assistantId, (m) => ({ ...m, error }));
    };

    // What Claude knows about this learner: learned concepts and open weak spots.
    const { stars, misconceptions } = useProgress.getState();
    const learner = learnerProfile(stars, misconceptions);
    let firstGlintPath: string | null = null;
    const pathsBefore = new Set(Object.keys(ws.files));
    let createdFile = false;
    let wroteFiles = false;
    let finished = false;
    let reportedError = false;
    // Files Claude has started rewriting but not finished, with their last
    // complete content (undefined = the file is new). Rolled back if the build ends early.
    const inFlight = new Map<string, string | undefined>();
    const controller = new AbortController();
    activeBuild = controller;

    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, history, files: ws.files, mentor: ws.mentor, learner: learner.profile }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        fail(body.error ?? `Request failed (${res.status})`);
        return;
      }

      for await (const ev of readNdjson<BuildEvent>(res)) {
        const s = useWorkspace.getState();
        switch (ev.type) {
          case "status":
            s.setBusy(ev.status);
            if (ev.status === "thinking" && !progress().steps.some((p) => p.id === "plan")) {
              progress().advance({ id: "plan", label: "Planning the approach" });
            }
            break;
          case "thought":
            progress().addThought(ev.text);
            break;
          case "text":
            if (!progress().steps.some((p) => p.id === "summary")) {
              progress().advance({ id: "summary", label: "Writing a summary" });
            }
            patch(assistantId, (m) => ({ ...m, text: m.text + ev.text }));
            break;
          case "file_progress":
            if (!inFlight.has(ev.path)) inFlight.set(ev.path, s.files[ev.path]);
            if (s.streamingPath !== ev.path) {
              s.setStreamingPath(ev.path);
              s.setActiveFile(ev.path);
              progress().advance({ id: `file:${ev.path}`, label: `Writing ${ev.path}` });
            }
            progress().upsert({ id: `file:${ev.path}`, label: `Writing ${ev.path}`, state: "active", detail: kb(ev.content) });
            s.setFile(ev.path, ev.content);
            break;
          case "file_done":
            progress().upsert({ id: `file:${ev.path}`, label: `Wrote ${ev.path}`, state: "done", detail: kb(ev.content) });
            inFlight.delete(ev.path);
            wroteFiles = true;
            if (!pathsBefore.has(ev.path)) createdFile = true;
            s.setFile(ev.path, ev.content);
            s.setActiveFile(ev.path);
            s.setStreamingPath(null);
            patch(assistantId, (m) =>
              m.files.includes(ev.path) ? m : { ...m, files: [...m.files, ev.path] },
            );
            break;
          case "glint":
            glintCount++;
            progress().upsert({
              id: "glints",
              label: `Spotted ${glintCount} thing${glintCount === 1 ? "" : "s"} worth knowing`,
              state: "done",
            });
            firstGlintPath ??= ev.glint.path;
            {
              const { buildsOn, retestOf, ...glint } = ev.glint;
              s.addGlint({
                ...glint,
                links: buildsOn.flatMap((b, i) => {
                  const to = learner.learnedRef[b.ref];
                  const dup = buildsOn.slice(0, i).some((p) => learner.learnedRef[p.ref] === to);
                  return to && !dup ? [{ to, why: b.why }] : [];
                }),
                retestId: retestOf ? (learner.weakRef[retestOf] ?? null) : null,
                source: "glint",
                status: "new",
                createdAt: Date.now(),
              });
            }
            patch(assistantId, (m) => ({ ...m, glintIds: [...m.glintIds, ev.glint.id] }));
            break;
          case "error":
            fail(ev.message);
            break;
          case "done":
            finished = true;
            break;
        }
      }
      // The stream can end without "done" (e.g. the server hit its time limit).
      if (!finished && !reportedError && !controller.signal.aborted) {
        fail("The build was cut off before it finished. Try asking for a smaller step.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") fail("Lost connection to the server.");
    } finally {
      if (activeBuild === controller) activeBuild = null;
      useBuildProgress.getState().finish();
      const s = useWorkspace.getState();
      // Never leave a half-written file behind: restore the last complete version.
      if (inFlight.size && s.projectId === ws.projectId) {
        for (const [path, previous] of inFlight) {
          if (previous === undefined) s.removeFile(path);
          else s.setFile(path, previous);
        }
        const names = [...inFlight.keys()];
        const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
        patch(assistantId, (m) => ({
          ...m,
          note:
            names.length > 1
              ? `Stopped mid-write, so I rolled back ${list}: new files removed, edited files restored.`
              : `Stopped before ${list} was finished, so I ${inFlight.get(names[0]) === undefined ? "removed it" : "kept the previous version"}.`,
        }));
      }
      s.setBusy(null);
      s.setStreamingPath(null);
      // Offer a "how it works" map on the first build, and again when the
      // app's shape changes (new files). Respect mentor mode Off.
      if (wroteFiles && s.mentor !== "off" && (!s.flow || createdFile)) {
        s.patchMessage(assistantId, (m) => ({ ...m, offerFlow: true }));
      }
      // Land on the code that has something worth noticing.
      if (firstGlintPath && s.files[firstGlintPath] !== undefined) s.setActiveFile(firstGlintPath);
    }
  }, []);

  return { send, stop: stopBuild };
}
