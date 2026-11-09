const RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000] as const;

/** Four bounded retries, then leave the explicit retry/LOCAL controls available. */
export function imageRetryDelay(failures: number): number | null {
  return RETRY_DELAYS[failures - 1] ?? null;
}

/** Reject error documents and truncated downloads before caching them as imagery. */
export function hasJpegEnvelope(bytes: Uint8Array): boolean {
  return bytes.length >= 64 && bytes[0] === 0xff && bytes[1] === 0xd8
    && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}
