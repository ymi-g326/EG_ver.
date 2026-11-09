import { test } from "node:test";
import assert from "node:assert/strict";
import { joinAppPath } from "../lib/app-path.ts";
test("Pages routes, recorded audio and worklets use the repository prefix; other origins stay intact", () => {
  for (const path of ["/", "/local/", "/brand/tenkoh2-en-light.svg", "/audio/earth/ocean-waves.mp3", "/audio/scratch-player.js"]) {
    assert.equal(joinAppPath(path, "/EG_ver./"), "/EG_ver." + path);
    assert.equal(joinAppPath(path, ""), path);
  }
  assert.equal(joinAppPath("https://example.org/a", "/EG_ver."), "https://example.org/a");
  assert.equal(joinAppPath("//example.org/a", "/EG_ver."), "//example.org/a");
  assert.equal(joinAppPath("/api/orbit", "https://example.org/"), "https://example.org/api/orbit");
});
