"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Audio and Canvas start from one browser snapshot, independent of edge SSR. */
export default function BrowserPlayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : <main aria-busy="true" aria-label="EARTH GROOVE loading" />;
}
