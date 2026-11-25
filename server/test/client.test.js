import test from "node:test";
import assert from "node:assert/strict";
import { request } from "../../web/src/api/client.js";

test("bodyless actions do not send JSON content type that Fastify rejects", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/tasks/task-id/plan");
    assert.equal(options.method, "POST");
    assert.equal(options.headers?.["Content-Type"], undefined);
    assert.equal(options.body, undefined);
    return { ok: true, json: async () => ({ status: "PLANNING" }) };
  };
  assert.deepEqual(await request("/tasks/task-id/plan", { method: "POST" }), {
    status: "PLANNING",
  });
});
