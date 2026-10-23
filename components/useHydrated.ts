"use client";
import { useEffect, useState } from "react";

/** True after mount, so persisted (localStorage) state can render without hydration mismatches. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
