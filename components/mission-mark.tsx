/** Reuse the existing outlined mission artwork at its original proportions. */
export default function MissionMark({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  // The local SVG is already an optimized, outlined wordmark.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src="/brand/tenkoh2-en-light.svg" width={788} height={174}
    alt={decorative ? "" : "TEN-KOH2"} aria-hidden={decorative || undefined} />;
}
