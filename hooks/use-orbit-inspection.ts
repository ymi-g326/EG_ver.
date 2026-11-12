"use client";

import { useEffect, useMemo, useState } from "react";
import { orbitReader, predictPasses, type ReferenceSite } from "@/lib/orbit-inspection";
import type { InspectOrbit } from "@/lib/inspect-data";

export function useOrbitInspection(orbit: InspectOrbit | null | undefined, site: ReferenceSite, active: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const minute = now == null ? null : Math.floor(now / 60_000) * 60_000;
  const prediction = useMemo(() => {
    if (!active || !orbit || minute == null) return null;
    try { return predictPasses(orbit, site, minute); } catch { return null; }
  }, [active, orbit, site, minute]);
  const reader = useMemo(() => {
    if (!active || !orbit || minute == null) return null;
    try { return orbitReader(orbit, minute); } catch { return null; }
  }, [active, orbit, minute]);
  const look = useMemo(() => active && now != null ? reader?.look(now, site) ?? null : null, [active, reader, now, site]);
  return { now, look, prediction };
}
