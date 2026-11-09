"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { STYLE_FEEDBACK, styleWaveRim, type FeedbackStyle } from "@/lib/style-feedback";
import { activeStyleWaves, appendStyleWave, sampleStyleWaves, scratchWaveSpec, WAVE_DISPLACEMENT_SCALE, type StyleWave } from "@/lib/style-waves";
import type { ScratchWaveSource } from "@/lib/scratch-feedback";

const FeedbackContext = createContext<(style: FeedbackStyle, button: HTMLElement) => void>(() => undefined);
const ScratchFeedbackContext = createContext<(style: FeedbackStyle, source: ScratchWaveSource) => void>(() => undefined);
export const useStyleFeedback = () => useContext(FeedbackContext);
export const useScratchFeedback = () => useContext(ScratchFeedbackContext);

/** The live DOM itself refracts; one bounded wave field handles overlapping gestures. */
export default function StyleFeedback({ children }: { children: ReactNode }) {
  const id = `eg-style-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<SVGFEImageElement>(null);
  const displacementRef = useRef<SVGFEDisplacementMapElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const wavesRef = useRef<StyleWave[]>([]);
  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current); frameRef.current = 0; wavesRef.current = [];
    const surface = surfaceRef.current;
    if (surface) {
      surface.style.filter = ""; surface.style.willChange = "";
      delete surface.dataset.styleWave; delete surface.dataset.waveCount; delete surface.dataset.waveKind; delete surface.dataset.waveReach;
    }
    if (overlayRef.current) overlayRef.current.hidden = true;
    imageRef.current?.removeAttribute("href");
  }, []);

  const emit = useCallback((style: FeedbackStyle, source: ScratchWaveSource, kind: StyleWave["kind"]) => {
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const surface = surfaceRef.current, overlay = overlayRef.current, image = imageRef.current;
    if (!surface || !overlay || !image) return;
    const bounds = surface.getBoundingClientRect();
    const width = window.innerWidth, height = window.innerHeight;
    const x = Math.max(0, Math.min(width, source.x)), y = Math.max(0, Math.min(height, source.y));
    const reach = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
    if (!bounds.width || !bounds.height || !reach) return;
    const spec = kind === "scratch" ? scratchWaveSpec(style, source.size, reach)
      : { reach, durationMs: STYLE_FEEDBACK[style].durationMs, detail: 1 };
    wavesRef.current = appendStyleWave(wavesRef.current, {
      style, x, y, kind, ...spec, started: performance.now(),
      strength: kind === "style" ? 1 : source.strength * .8,
    }, kind === "scratch" && source.continuation);
    if (frameRef.current || !wavesRef.current.length) return;
    const map = document.createElement("canvas"), factor = 192 / Math.max(bounds.width, bounds.height);
    map.width = Math.max(2, Math.round(bounds.width * factor)); map.height = Math.max(2, Math.round(bounds.height * factor));
    const mapContext = map.getContext("2d"), context = overlay.getContext("2d");
    if (!mapContext || !context) { stop(); return; }
    const pixels = mapContext.createImageData(map.width, map.height);
    image.setAttribute("width", String(bounds.width)); image.setAttribute("height", String(bounds.height));
    displacementRef.current?.setAttribute("scale", String(WAVE_DISPLACEMENT_SCALE));
    overlay.width = width; overlay.height = height; overlay.hidden = false;
    surface.style.willChange = "filter";
    let painted = -Infinity;
    const draw = () => {
      // Birth and paint use the same clock, including pointer events between frame callbacks.
      const now = performance.now();
      const waves = activeStyleWaves(wavesRef.current, now);
      if (!waves.length || document.hidden) { stop(); return; }
      wavesRef.current = waves;
      if (now - painted >= 32) {
        painted = now;
        surface.dataset.styleWave = waves.at(-1)!.style;
        surface.dataset.waveKind = waves.at(-1)!.kind;
        surface.dataset.waveCount = String(waves.length);
        surface.dataset.waveReach = String(Math.round(waves.at(-1)!.reach));
        for (let row = 0; row < map.height; row++) for (let col = 0; col < map.width; col++) {
          const vector = sampleStyleWaves(waves,
            bounds.left + (col + .5) / map.width * bounds.width,
            bounds.top + (row + .5) / map.height * bounds.height);
          const at = (row * map.width + col) * 4;
          pixels.data[at] = 255 * (.5 + vector.x / WAVE_DISPLACEMENT_SCALE);
          pixels.data[at + 1] = 255 * (.5 + vector.y / WAVE_DISPLACEMENT_SCALE);
          pixels.data[at + 2] = 128; pixels.data[at + 3] = 255;
        }
        mapContext.putImageData(pixels, 0, 0); image.setAttribute("href", map.toDataURL("image/png"));
        surface.style.filter = `url(#${id})`;
        context.clearRect(0, 0, width, height);
        for (const wave of waves) {
          const { progress, style } = wave, detail = wave.detail ?? 1;
          const life = Math.min(1, progress / .035, (1 - progress) / .22);
          context.strokeStyle = style === "ambient" ? "#6af5db" : "#c7f483";
          context.shadowColor = context.strokeStyle; context.shadowBlur = style === "ambient" ? 15 : 10;
          for (const [offset, weight] of [[0, 1], [style === "ambient" ? 54 : 32, .45], [96, .18]]) {
            const radius = progress * wave.reach * 1.25 - offset * detail;
            if (radius <= 0) continue;
            const opacity = wave.kind === "scratch" ? Math.max(.65, wave.strength) : wave.strength;
            context.globalAlpha = life * weight * opacity * (style === "ambient" ? wave.kind === "scratch" ? .34 : .23 : .43);
            context.lineWidth = (style === "ambient" ? 1.2 : 2) * Math.sqrt(detail);
            context.lineJoin = "round";
            context.beginPath();
            const segments = style === "ambient" ? 180 : 224;
            for (let step = 0; step <= segments; step++) {
              const angle = step / segments * Math.PI * 2;
              const jitter = styleWaveRim(style, angle, progress) * detail * Math.min(1, radius / (60 * detail));
              const px = wave.x + Math.cos(angle) * (radius + jitter), py = wave.y + Math.sin(angle) * (radius + jitter);
              if (!step) context.moveTo(px, py); else context.lineTo(px, py);
            }
            context.closePath(); context.stroke();
          }
        }
      }
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
  }, [id, stop]);

  const play = useCallback((style: FeedbackStyle, button: HTMLElement) => {
    stop();
    const source = button.getBoundingClientRect();
    emit(style, { x: source.left + source.width / 2, y: source.top + source.height / 2, strength: 1, size: 1 }, "style");
  }, [emit, stop]);
  const scratch = useCallback((style: FeedbackStyle, source: ScratchWaveSource) => emit(style, source, "scratch"), [emit]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("resize", stop); window.addEventListener("scroll", stop, { passive: true });
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop); motion.addEventListener("change", stop);
    return () => {
      stop(); window.removeEventListener("resize", stop); window.removeEventListener("scroll", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop); motion.removeEventListener("change", stop);
    };
  }, [stop]);

  return <FeedbackContext.Provider value={play}><ScratchFeedbackContext.Provider value={scratch}>
    <div ref={surfaceRef} className="v2-style-surface">{children}</div>
    <svg className="v2-style-filter" width="0" height="0" aria-hidden="true" focusable="false">
      <defs><filter id={id} x="-3%" y="-3%" width="106%" height="106%" colorInterpolationFilters="sRGB">
        <feImage ref={imageRef} x="0" y="0" preserveAspectRatio="none" result="wave-map" />
        <feDisplacementMap ref={displacementRef} in="SourceGraphic" in2="wave-map" scale={WAVE_DISPLACEMENT_SCALE} xChannelSelector="R" yChannelSelector="G" />
      </filter></defs>
    </svg>
    <canvas ref={overlayRef} className="v2-style-wave" aria-hidden="true" hidden />
  </ScratchFeedbackContext.Provider></FeedbackContext.Provider>;
}
