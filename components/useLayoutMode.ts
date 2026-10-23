"use client";
import { useEffect, useState } from "react";

/**
 * wide: chat | editor | preview side by side
 * medium: chat | one tabbed pane (Code / Preview / How it works)
 * narrow: everything in tabs, including Chat
 */
export type LayoutMode = "wide" | "medium" | "narrow";

const WIDE = "(min-width: 1200px)";
const MEDIUM = "(min-width: 760px)";

function current(): LayoutMode {
  if (typeof window === "undefined") return "wide";
  if (window.matchMedia(WIDE).matches) return "wide";
  return window.matchMedia(MEDIUM).matches ? "medium" : "narrow";
}

export function useLayoutMode() {
  const [mode, setMode] = useState<LayoutMode>(current);
  useEffect(() => {
    const update = () => setMode(current());
    const queries = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)];
    queries.forEach((q) => q.addEventListener("change", update));
    return () => queries.forEach((q) => q.removeEventListener("change", update));
  }, []);
  return mode;
}
