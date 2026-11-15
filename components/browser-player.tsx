"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Audio and Canvas start from one browser snapshot, independent of edge SSR. */
export default function BrowserPlayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : <main className="v2-boot" role="status"><span>EARTH GROOVE</span><strong>プレイヤーを起動中</strong><small>地球を聴く準備をしています。</small></main>;
}
