"use client";
import { useCallback } from "react";
import { hashString } from "@/lib/hash";
import { useWorkspace } from "@/lib/workspace";

/** Turn an editor selection into a user-initiated glint and open its lesson. */
export function useAskWhy() {
  return useCallback((path: string, selection: string) => {
    const snippet = selection.replace(/^\n+|\s+$/g, "");
    if (!snippet) return;
    const ws = useWorkspace.getState();
    const id = `ask-${hashString(path + snippet)}`;
    if (!ws.glints[id]) {
      ws.addGlint({
        id,
        path,
        snippet,
        title: "Why is it written this way?",
        teaser: "",
        category: "architecture",
        concept: "",
        links: [],
        retestId: null,
        source: "ask-why",
        status: "opened",
        createdAt: Date.now(),
      });
    }
    ws.openGlint(id);
  }, []);
}
