import { test } from "node:test";
import assert from "node:assert/strict";
import { publicDataCors } from "../lib/public-data-cors.ts";
test("public Earth responses remain readable from Pages, including missing-data errors", async () => {
  const response = publicDataCors(Response.json({ error: "UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
  assert.deepEqual(await response.json(), { error: "UNAVAILABLE" });
});
