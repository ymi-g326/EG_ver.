"use client";

import StyleFeedback from "@/components/style-feedback";
import LoadingCursor from "@/components/loading-cursor";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { VIEW_TRANSITION_MS } from "@/lib/view-transition-sound";
const DURATION = VIEW_TRANSITION_MS;
const noise = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** A single, persistent switch sits above both views and the digital wipe. */
export default function PlayerViews({ inspect, onChange, touch, inspection, loading = false }: {
  inspect: boolean; loading?: boolean; onChange: (inspect: boolean) => void; touch: ReactNode; inspection: ReactNode;
}) {
  const [displayed, setDisplayed] = useState(inspect);
  const displayedRef = useRef(inspect);
  const [revealing, setRevealing] = useState(false);
  const changing = inspect !== displayed || revealing;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (displayedRef.current === inspect) {
      const idle = requestAnimationFrame(() => setRevealing(false));
      return () => cancelAnimationFrame(idle);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const instant = requestAnimationFrame(() => {
        displayedRef.current = inspect; setDisplayed(inspect); setRevealing(false);
      });
      return () => cancelAnimationFrame(instant);
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      if (!canvas || !context) return;
      const width = window.innerWidth, height = window.innerHeight;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const progress = Math.min(1, (now - start) / DURATION);
      const coverage = progress < .42 ? progress / .42 : progress <= .58 ? 1 : (1 - progress) / .42;
      context.clearRect(0, 0, width, height);
      // Stable block-noise thresholds: one cover and one reveal, without strobing.
      const cols = 28, rows = 48, w = width / cols, h = height / rows;
      for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
        const rank = noise(Math.floor(x / 5), Math.floor(y / 2)) * .7 + noise(x, y) * .3;
        if (rank > coverage) continue;
        const tone = Math.round(10 + noise(Math.floor(x / 5), y) * 12);
        context.fillStyle = `rgb(${tone - 6},${tone + 7},${tone + 8})`;
        context.fillRect(Math.floor(x * w), Math.floor(y * h), Math.ceil(w) + 1, Math.ceil(h) + 1);
        if (coverage < .99 && coverage - rank < .055) {
          context.fillStyle = inspect ? "rgba(106,245,219,.35)" : "rgba(186,255,61,.3)";
          context.fillRect(Math.floor(x * w), Math.floor(y * h), Math.ceil(w) + 1, 1);
        }
      }
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const swap = window.setTimeout(() => { displayedRef.current = inspect; setDisplayed(inspect); setRevealing(true); }, DURATION / 2);
    const end = window.setTimeout(() => { setRevealing(false); context?.clearRect(0, 0, canvas!.width, canvas!.height); }, DURATION);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(swap); window.clearTimeout(end); };
  }, [inspect]);

  return <StyleFeedback><div className={`v2-views ${changing ? "is-switching" : ""}`} data-view={displayed ? "inspect" : "touch"}
    onDragStartCapture={event => {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
    }}>
    <div className="v2-persistent-switch" aria-label="画面の切り替え">
      <button type="button" role="switch" aria-label="INSPECT表示" aria-checked={inspect} aria-disabled={changing} onClick={() => { if (!changing) onChange(!inspect); }}>
        <span className="v2-switch-thumb" aria-hidden="true" />
        <span>TOUCH</span><span>INSPECT</span>
      </button>
    </div>
    <div className="v2-player-wrap" hidden={displayed} inert={changing || displayed}>{touch}</div>
    <div className="v2-inspect-wrap" hidden={!displayed} inert={changing || !displayed}>{inspection}</div>
    <LoadingCursor active={changing||loading}/>
    <canvas ref={canvasRef} className="v2-digital-wipe" aria-hidden="true" hidden={!changing} />
  </div></StyleFeedback>;
}
