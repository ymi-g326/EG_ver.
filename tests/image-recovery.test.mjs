import { test } from "node:test";
import assert from "node:assert/strict";
import { imageRetryDelay, hasJpegEnvelope } from "../lib/image-recovery.ts";

test("transient image failures retry with backoff, stop after four attempts, and a new load starts fresh", () => {
  assert.deepEqual([1, 2, 3, 4].map(imageRetryDelay), [2000, 5000, 15000, 30000]);
  for (const count of [0, 5, 100, -1, NaN, Infinity]) assert.equal(imageRetryDelay(count), null);
  assert.equal(imageRetryDelay(1), 2000);
});

test("NASA error documents or incomplete JPEG downloads are not accepted as image responses", () => {
  assert.equal(hasJpegEnvelope(new TextEncoder().encode('<ServiceException>Unavailable</ServiceException>')), false);
  assert.equal(hasJpegEnvelope(new Uint8Array()), false);
  const jpeg = new Uint8Array(128); jpeg.set([0xff, 0xd8, 0xff, 0xe0]); jpeg.set([0xff, 0xd9], 126);
  assert.equal(hasJpegEnvelope(jpeg), true);
  assert.equal(hasJpegEnvelope(jpeg.slice(0, -2)), false);
  assert.equal(hasJpegEnvelope(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), false);
});
